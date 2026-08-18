#!/usr/bin/env node

import { parseOptionsAndParams } from './options.js';
import { Console } from '../common/index.mjs';
import { printFunctionApi } from './cmd-info.js';
import { runFunction } from './cmd-run.js';

export { printFunctionApi } from './cmd-info.js';
export { runFunction } from './cmd-run.js';

export function cli(cliArgs: string[]) {
  const inputs = parseOptionsAndParams(cliArgs);
  Console.debug(inputs);

  if (inputs.options.info) {
    return printFunctionApi(inputs);
  }

  return runFunction(inputs);
}

export async function main() {
  try {
    await cli(process.argv.slice(2));
  } catch (error) {
    Console.error(String(error));
    process.exit(1);
  }
}

setTimeout(main);
