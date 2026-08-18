import type { Format, Request, Response, ApiDescription, Configuration } from './types.mjs';
import { HttpServer } from './http.mjs';

export { Console } from './console.mjs';
export type { Configuration, Request, Response, Format, ApiDescription };

export function lambda(configuration: Configuration | (<T>(input: Request, output: Response) => Promise<T>)) {
  if (typeof configuration === 'function') {
    return new HttpServer({
      actions: {
        action: {
          default: true,
          handler: configuration,
        },
      },
    });
  }

  return new HttpServer(configuration);
}
