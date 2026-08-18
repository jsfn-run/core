import { Console } from '@node-lambdas/core';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { RequestOptions, request as http, IncomingMessage } from 'node:http';
import { request as https } from 'node:https';
import { join } from 'node:path';
import process from 'node:process';
import { baseRequestOptions, buildFunctionUrl } from './common.js';
import { CliInputs } from './options.js';

const CWD = process.cwd();
const shortHelp = `
fn [+flag] name [--option=value]
Flags:
  +help
  +info
  +auth=[name]
  +debug
  +local
  +port=[number]
  +data=[data]
  +nodata

See all options at https://github.com/node-lambdas/cli#all-options
`;

export async function runFunction(inputs: CliInputs, input = process.stdin, output = process.stdout) {
  if (inputs.options.help) {
    console.log(shortHelp);
    process.exit(1);
  }

  const { options } = inputs;
  const credentials = options.auth ? await readCredentials(inputs) : null;
  const url = buildFunctionUrl(inputs);
  const stdin = options.stdin ? createReadStream(join(CWD, String(options.stdin))) : input;

  const onResponse = (response: IncomingMessage) => {
    const next = response.headers['x-next'];

    if (next) {
      const nextOptions = tryParse(Buffer.from(String(response.headers['x-next']), 'base64').toString('utf-8'));
      const { name, params = {}, inputs = [] } = nextOptions;
      return runFunction({ name, params, options: {}, inputs }, input, output);
    }

    if (response.statusCode !== 200) {
      output.write(response.statusCode + ' ' + response.statusMessage + ': ' + url + '\n');
      response.on('end', () => process.exit(1));
      response.pipe(process.stderr);
      return;
    }

    response.pipe(output);
  };

  const requestOptions: RequestOptions = { ...baseRequestOptions };

  if (credentials) {
    const token = Buffer.from(JSON.stringify(credentials), 'utf-8').toString('base64');
    requestOptions.headers.authorization = 'Bearer ' + token;
  }

  Console.debug(String(url), requestOptions);

  const actor = url.protocol === 'http:' ? http : https;
  const request = actor(url, requestOptions, onResponse);
  request.on('error', (message) => Console.error(message));

  if (options.data) {
    request.write(options.data);
    request.end();
    return;
  }

  if (options.nodata) {
    request.end();
    return;
  }

  stdin.pipe(request);
}

async function readCredentials(inputs: CliInputs) {
  const { options, name } = inputs;
  const filePath = join(CWD, 'credentials.json');
  const propertyPath = String(options.auth) === 'true' ? ['default', name] : String(options.auth).trim().split('/');
  const [groupName, functionName] = propertyPath;

  if (existsSync(filePath)) {
    try {
      const credentials = JSON.parse(readFileSync(filePath, 'utf-8'));
      const group = credentials[groupName];
      return (group && group[functionName]) || {};
    } catch (error) {
      Console.error(error);
    }
  }

  Console.error(
    `Invalid credentials: ${groupName}/${functionName}. Check if credentials.json exists and is a valid JSON file.`,
  );
}

function tryParse(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}