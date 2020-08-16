import { lambda as v1 } from './v1.js';
export { Format, uid } from './common.js';

export function lambda(configuration, main) {
  if (!main && configuration) {
    main = configuration;
    configuration = {};
  }

  switch (configuration.version || 1) {
    case 1:
      v1(configuration, main);
      break;
  }
}
