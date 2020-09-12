import { lambda as v1 } from './v1.js';
import { lambda as v2 } from './v2.js';
export { Format, uid } from './common.js';
export { Console } from './console.js';
export { HttpStatus } from './http.js';

export function lambda(configuration) {
  switch (configuration.version || 1) {
    case 1:
      return v1(configuration);

    case 2:
      return v2(configuration);
  }
}
