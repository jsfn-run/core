import process from "node:process";
import { lambda } from "../dist/index.mjs";

async function main() {
  const fn = await import(process.env.FN_PATH);
  lambda(fn.default);
}

main();
