import * as url from 'node:url';
import process from 'node:process';
import { lambda as v1, Configuration as V1Configuration } from './v1.mjs';
import { lambda as v2, Configuration as V2Configuration } from './v2.mjs';

async function main() {
  // @ts-ignore
  const fn = await import(process.env.FN_MODULE);
  lambda(fn.default);
}

export function lambda(configuration: any) {
  if (typeof configuration === 'function') {
    return v1({ version: 1, handler: configuration })
  }

  switch (configuration.version || 1) {
    case 1:
      return v1(configuration as V1Configuration);

    case 2:
      return v2(configuration as V2Configuration);
    
    default:
      throw new Error('Invalid configuration');      
  }
}

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url);
  
  if (process.argv[1] === modulePath) {
    main();
  }
}
