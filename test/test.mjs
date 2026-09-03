import process from 'node:process';
import { lambda } from '../dist/common/index.mjs';
import { join } from 'node:path';

async function main() {
  const path = join(process.cwd(), process.argv[2]);
  const fn = await import(path);
  return lambda(fn.default);
}

main();
