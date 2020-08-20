import { lambda as v1 } from './v1.js';
import { lambda as v2 } from './v2.js';
export { Format, uid } from './common.js';

export function lambda(configuration, main) {
  if (!main && typeof configuration === 'function') {
    main = configuration;
    configuration = {};
  }

  switch (configuration.version || 1) {
    case 1:
      return v1(configuration, main);

    case 2:
      return v2(configuration);
  }
}
