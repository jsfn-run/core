import process from "node:process";
import { lambda } from "./lambda.mjs";

async function main() {
  // @ts-ignore
  const fn = await import(process.env.FN_MODULE || process.env.FN_PATH);
  lambda(fn.default);
}

main();
