import process from 'node:process';
import { lambda } from '../dist/index.mjs';
import { join } from 'node:path';

async function main() {
  const fn = await import(join(process.cwd(), process.argv[2]));
  lambda(fn.default);
}

main();
