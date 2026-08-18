import { ApiDescription } from '@node-lambdas/core';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { baseRequestOptions, buildFunctionUrl, readStream } from './common.js';
import { CliInputs } from './options.js';

export const Colors = {
  error: '\u001b[33;1m',
  info: '\u001b[34;1m',
  log: '\u001b[37;1m',
  reset: '\u001b[0m',
};

export function printFunctionApi(inputs: CliInputs) {
  inputs.inputs.push('api');
  const url = buildFunctionUrl(inputs);

  return new Promise((resolve, reject) => {
    const onResponse = async (response: IncomingMessage) => {
      if (response.statusCode !== 200) {
        reject(new Error('Function not found'));
        return;
      }

      const buffer = await readStream(response);
      try {
        showApiOptions(buffer.toString('utf8'), inputs);
        resolve(null);
      } catch (error) {
        reject(error);
      }
    };

    const reqOptions = { ...baseRequestOptions, method: 'OPTIONS' };
    const request = url.protocol === 'http:' ? httpRequest : httpsRequest;
    request(url, reqOptions, onResponse).end();
  });
}

function showApiOptions(json: string, inputs: CliInputs) {
  if (inputs.options.json) {
    return console.log(json);
  }

  const functionName = inputs.options.local ? '+local' : inputs.name;
  const descriptor = JSON.parse(json) as ApiDescription;
  const actionList = descriptor.actions;

  if (!Array.isArray(actionList)) {
    throw new Error('Invalid response from function server');
  }

  const output: string[] = [];

  if (descriptor.description) {
    output.push(descriptor.description);
  }

  output.push('Usage:', `${Colors.error}fn ${functionName} <action> <options>${Colors.reset}`, '');
  output.push('Actions:', '');

  actionList.forEach((action) => {
    const options = Object.entries(action.options)
      .map(([key, value]) => ' --' + key + '=<' + value + '>')
      .join(' ');

    output.push(
      `${Colors.error}fn ${functionName} ${action.name} ${options.length ? Colors.log + options : ''} ${Colors.reset}`,
    );

    if (action.description) {
      output.push(Colors.log + action.description + Colors.reset);
    }

    output.push(`Format: ${Colors.log}${action.input || 'buffer'} => ${action.output || 'buffer'}${Colors.reset}`);

    if (action.credentials?.length) {
      output.push(`Credentials: ${Colors.log}${action.credentials.join(', ')}${Colors.reset}`);
    }
    output.push('');
  });

  console.log(output.join('\n'));
}
