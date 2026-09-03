import { spawn, SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import process from 'node:process';
import { baseDomain, Console, lambda } from './common/index.mjs';

function exec(command, args?: string[], options?: SpawnOptions) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        return resolve({ stdout, stderr, code, ok: true });
      }

      const err = new Error(`Process exited with code ${code}`);
      Object.assign(err, { stdout, stderr, code, ok: false });
      reject(err);
    });
  });
}

const repoUrl = (repo: string) => {
  const [owner, ref = 'main'] = repo.split(':');
  return `https://codeload.github.com/${owner}/zip/refs/heads/${ref}`;
};

async function main() {
  try {
    if (process.env.SOURCE_DIR) {
      await startLocalFolderServer(process.env.SOURCE_DIR);
      return;
    }

    const source = getSourceUrl();

    if (!source) {
      throw new Error('No source provided');
    }

    await startZipRemoteServer(source);
  } catch (error: any) {
    Console.error(`Failed to run: ${String(error)}`);
    Console.debug(error.stack);
  }
}

function getSourceUrl() {
  const sourceRepo = process.env.REPOSITORY;
  const sourceUrl = process.env.SOURCE_URL;
  const source = !sourceUrl && sourceRepo ? repoUrl(sourceRepo) : sourceUrl;

  if (source) {
    Console.info('Using source at ' + source);
  }

  return source;
}

async function extractFile(filePath: string, target: string) {
  let ps: any;
  const tmpDir = mkdtemp('fn');

  switch (true) {
    case filePath.endsWith('.tgz'):
      ps = await exec('tar', ['xzf', tmpDir, filePath]);

      if (!ps.ok) {
        throw new Error('Unable to extract file: ' + ps.stderr);
      }

      break;

    case filePath.endsWith('.zip'):
      ps = await exec('unzip', ['-o', '-d', tmpDir, filePath]);

      if (!ps.ok) {
        throw new Error('Unable to extract file: ' + ps.stderr);
      }

      break;

    default:
      throw new Error(`Unsupported file format at ${filePath}`);
  }

  ps = await exec('find', [tmpDir, '-name', 'functions', '-type', 'd']);

  if (!ps.ok || !ps.stdout) {
    throw new Error(`Invalid file content at ${filePath}`);
  }

  const functionsPath = ps.stdout.trim();
  await exec('mv', [functionsPath, target]);
  await exec('rm', ['-r', tmpDir]);
}

async function npmInstall(path: string) {
  if (!existsSync(join(path, 'package.json'))) {
    Console.info(`Unable to find package.json at ${path}`);
    return;
  }

  Console.info(`Installing dependencies from ${path}`);
  const npmi = await exec('npm', ['i', '--omit=dev', '--no-audit', '--no-fund'], { cwd: path });

  if (!npmi.ok) {
    Console.log(npmi.stdout);
    Console.error(npmi.stderr);
    throw new Error(`Failed to install dependencies`);
  }

  Console.log(npmi.stdout);
}

async function download(url: string): Promise<string> {
  let extension = '';

  if (url.endsWith('.tgz') || url.endsWith('.tar.gz')) {
    extension = '.tgz';
  }

  if (url.endsWith('.zip') || url.includes('zip/refs')) {
    extension = '.zip';
  }

  if (!extension) {
    throw new Error(`Unsupported format at ${url}`);
  }

  const filePath = '/tmp/fn' + extension;
  if (existsSync(filePath) && process.env.USE_CACHED) {
    return filePath;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${await response.text()}`);
  }

  const file = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, file);

  return filePath;
}

function findIndexFile(fnPath: string) {
  return ['index.mjs', 'index.js'].map((p) => join(fnPath, p)).find((p) => existsSync(p));
}

async function loadLambda(entrypoint: string, defer = false) {
  const mod = await import(entrypoint);
  const def = mod['default'] || mod;
  const configurations =
    typeof def === 'function'
      ? {
          actions: {
            action: {
              default: true,
              handler: def,
            },
          },
        }
      : Object.assign({}, def);

  const fn = { deferred: defer, ...configurations };
  return lambda(fn);
}

async function startServer(path: string) {
  if (process.env.MULTIPLEXED) {
    return await startMultiplexedServer(path);
  }

  const fnPath = findIndexFile(path);

  if (!fnPath) {
    throw new Error('Cannot run lambda: entrypoint not found.');
  }

  Console.log(`Loading ${fnPath}`);
  const { server } = await loadLambda(fnPath);

  Console.info(`[${new Date().toISOString().slice(0, 16)}] started from ${fnPath}`);
  server!.on('close', () => process.exit(1));
}

async function startMultiplexedServer(path: string) {
  const basePath = isAbsolute(path) ? path : join(process.cwd(), path);
  Console.info(`Running in multiplexed mode from ${basePath}`);
  const functions = await loadMultiplexedFunctions(basePath);
  const server = createServer((request, response) => {
    const fn =
      String(request.headers['x-forwarded-host'] || request.headers.host || '').replace(baseDomain, '') ||
      String(request.headers['x-lambda'] || '');

    if (!fn) {
      response.writeHead(400);
      response.end('Cannot determine which function to run');
      return;
    }

    if (!functions[fn]) {
      response.writeHead(404);
      response.end(`Function ${fn} not found`);
      return;
    }

    functions[fn].dispatch(request, response);
  });

  server.on('close', () => process.exit(1));
  server.listen(process.env.PORT, () => {
    Console.info(`[${new Date().toISOString().slice(0, 16)}] multiplexed server started on port ${process.env.PORT}`);
  });
}

async function loadMultiplexedFunctions(basePath: string) {
  const functionsPath = join(basePath, 'functions');
  const functions: Record<string, ReturnType<typeof lambda>> = {};
  const list = await readdir(functionsPath);
  const lockfile = join(basePath, 'package-lock.json');
  const lockFilePresent = existsSync(lockfile);

  if (lockFilePresent) {
    Console.info(`Using lockfile at ${lockfile}`);
    await npmInstall(basePath);
  }

  for (const folder of list) {
    const fullPath = join(functionsPath, folder);
    const indexFile = findIndexFile(fullPath);

    if (!indexFile) {
      Console.error(`Folder ${fullPath} ignored. No entrypoint found.`);
      continue;
    }

    if (!lockFilePresent) {
      const pkg = join(fullPath, 'package.json');
      if (existsSync(pkg)) {
        await npmInstall(fullPath);
      }
    }

    try {
      functions[folder] = await loadLambda(indexFile, true);
      Console.info(`Loaded ${folder} functions from ${fullPath}`);
    } catch (error: any) {
      Console.error(`Failed to load ${folder} from ${fullPath}: ${String(error)}`);
      Console.debug(error.stack);
    }
  }

  return functions;
}

async function startLocalFolderServer(sourceDir: string) {
  await npmInstall(sourceDir);
  await startServer(sourceDir);
}

async function startZipRemoteServer(sourceURL: string) {
  const workingDir = process.cwd();
  const filePath = await download(sourceURL);
  await extractFile(filePath, workingDir);
  await npmInstall(workingDir);
  await startServer(workingDir);
}

main();
