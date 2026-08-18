import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';
import { exec } from '@cloud-cli/exec';
import { Console, lambda } from './common/index.mjs';

const workingDir = process.env.WORKING_DIR || process.cwd();
const topLevelDomain = process.env.BASE_DOMAIN || '.jsfn.run';

const repoUrl = (repo: string) => {
  const [owner, ref = 'main'] = repo.split(':');
  return `https://codeload.github.com/${owner}/zip/refs/heads/${ref}`;
};

async function main() {
  if (!existsSync(workingDir)) {
    mkdirSync(workingDir, { recursive: true });
  }

  try {
    if (process.env.MULTIPLEXED) {
      await startMultiplexedServer();
      return;
    }

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

async function extractFile(filePath: string) {
  let ps: any;

  switch (true) {
    case filePath.endsWith('.tgz'):
      ps = await exec('tar', ['xzf', workingDir, filePath]);

      if (!ps.ok) {
        throw new Error('Unable to extract file: ' + ps.stderr);
      }

      break;

    case filePath.endsWith('.zip'):
      ps = await exec('unzip', ['-o', '-d', workingDir, filePath]);

      if (!ps.ok) {
        throw new Error('Unable to extract file: ' + ps.stderr);
      }

      break;

    default:
      throw new Error(`Unsupported file format at ${filePath}`);
  }
}

async function npmInstall(path: string = workingDir) {
  if (!existsSync(join(path, 'package.json'))) {
    Console.info(`Unable to find package.json at ${workingDir}`);
    return;
  }

  Console.info(`Installing dependencies from ${path}`);
  const npmi = await exec('npm', ['i', '--no-audit', '--no-fund'], { cwd: path });

  if (npmi.code !== 0) {
    Console.log(npmi.stdout);
    Console.error(npmi.stderr);
    throw new Error(`Failed to install dependencies`);
  }

  Console.log(npmi.stdout);
}

async function download(url: string) {
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

async function loadLambda(fnPath: string, defer = false) {
  // bypass code compression rewrite of import() call
  const i = Function('p', 'return import(p)');
  const mod = await i(fnPath);
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

async function startServer() {
  const fnPath = findIndexFile(workingDir);

  if (!fnPath) {
    throw new Error('Cannot run lambda: entrypoint not found.');
  }

  Console.log(`Loading ${fnPath}`);
  const { server } = await loadLambda(fnPath);

  Console.info(`[${new Date().toISOString().slice(0, 16)}] started from ${fnPath}`);
  server!.on('close', () => process.exit(1));
}

async function startLocalFolderServer(sourceDir: string) {
  process.chdir(sourceDir);
  await npmInstall();
  await startServer();
}

async function startMultiplexedServer() {
  const basePath = workingDir.startsWith('/') ? workingDir : join(process.cwd(), workingDir);
  Console.info(`Running in multiplexed mode from ${basePath}`);
  const functions = await loadMultiplexedFunctions(basePath);
  const server = createServer((request, response) => {
    const fn =
      String(request.headers['x-forwarded-host'] || request.headers.host || '').replace(topLevelDomain, '') ||
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
  server.listen(process.env.PORT);
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

async function startZipRemoteServer(source: string) {
  const filePath = await download(source);
  await extractFile(filePath);
  await npmInstall();
  await startServer();
}

main();
