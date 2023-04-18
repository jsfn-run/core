import { lambda as v1, Configuration as V1Configuration } from './v1.mjs';
import { lambda as v2, Configuration as V2Configuration } from './v2.mjs';

function lambda(configuration: any) {
  switch (configuration.version || 1) {
    case 1:
      return v1(configuration as V1Configuration);

    case 2:
      return v2(configuration as V2Configuration);
  }
}

async function main() {
  // @ts-ignore
  const fn = await import(process.env.FN_PATH);
  lambda(fn.default);
}

main();