import { HttpServer } from './http.js';

/**
 * @param {Format} configuration.input
 * @param {Format} configuration.output
 * @param {Function} main                         (input, output) => void;
 */
export const lambda = (configuration) => new V2(configuration);

export class V2 extends HttpServer {
  constructor(configuration) {
    super();
    this.configuration = this.getConfiguration(configuration);

    if (!configuration.actions) {
      throw new Error('No actions were provided in the current configuration');
    }

    const { actions } = this.configuration;
    this.actions = actions;

    Object.keys(actions).some(actionName => {
      if (actions[actionName].default) {
        actions.default = actions[actionName];
        return true;
      }
    });
  }

  onPrepare(request, response) {
    request.url = new URL('http://local' + request.url);

    const actionName = request.url.pathname.slice(1) || 'default';
    const action = this.actions[actionName] || null;

    if (!action) return;

    const { input, output } = action;
    request.options = request.url.searchParams;
    request.action = action;
    request.input = input;
    response.output = output;
  }

  onRun(request, response) {
    if (!request.action) {
      response.reject('Invalid action');
      return;
    }

    this.getHandler(request.action)(request, response);
  }

  getHandler(action) {
    return action.handler || ((_, response) => response.reject('Not implemented'));
  }

  getConfiguration(configuration) {
    return configuration;
  }
}
