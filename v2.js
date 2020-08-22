import { HttpServer } from './http.js';
import { request as post } from 'http';

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
    this.setDefaultAction();
  }

  setDefaultAction() {
    Object.keys(this.actions).some(actionName => {
      if (this.actions[actionName].default) {
        this.actions.default = this.actions[actionName];
        return true;
      }
    });
  }

  onPrepare(request, response) {
    request.url = new URL('http://localhost' + request.url);

    const actionName = request.url.pathname.slice(1) || 'default';
    const action = this.actions[actionName] || null;

    if (!action) return;

    const { input, output } = action;
    request.options = Object.fromEntries(request.url.searchParams.entries());
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

  track(request, response) {
    if (!process.env.GA_TRACKING_ID) return;

    const serialize = (o = {}) => Object.entries(o)
      .filter(([key]) => key !== 'handler')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    const { host } = request.headers;
    const { url, method } = request;
    const data = {
      v: '1',
      tid: process.env.GA_TRACKING_ID,
      cid: '1',
      category: `${method} ${host} ${url}`,
      action: serialize(request.action),
      label: serialize(request.options),
      value: response.statusCode,
    };

    try {
      const http = post('http://www.google-analytics.com/collect', { method: 'POST' });
      http.write(JSON.stringify(data));
      http.end();
    } catch (error) {
      this.logError(null, error);
    }
  }
}
