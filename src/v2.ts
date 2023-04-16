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
    this.configuration = configuration;

    if (!configuration.actions) {
      throw new Error('No actions were provided in the current configuration');
    }

    const { actions } = this.configuration;
    this.actions = { ...actions };
    this.setDefaultAction();
  }

  describeApi() {
    const actions = [];

    Object.entries(this.configuration.actions).forEach(([key, value]) => {
      const { input, output, credentials, options } = value;
      const action = {
        name: key,
        input: input || 'raw',
        output: output || 'raw',
        credentials: credentials || [],
        options: options || {},
        default: value.default,
        description: value.description || '',
      };

      actions.push(action);
    });

    return actions;
  }

  setDefaultAction() {
    Object.keys(this.actions).some((actionName) => {
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
    request.actionName = actionName;
    request.input = input;
    request.credentials = {};
    response.output = output;

    this.readCredentials(request, action);
  }

  readCredentials(request, action) {
    const requiredCredentials = action.credentials || [];

    if (requiredCredentials.length && request.headers.authorization) {
      const token = request.headers.authorization.replace(/\s*Bearer\s*/, '').trim();
      const json = Buffer.from(token, 'base64').toString('utf-8');
      const credentials = JSON.parse(json);
      requiredCredentials.forEach((key) => (request.credentials[key] = credentials[key]));
    }
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

  track(request, response) {
    if (!process.env.GA_TRACKING_ID) return;

    const { host } = request.headers;
    const { url, method } = request;

    const serialize = (o = {}) =>
      Object.entries(o)
        .filter(([key]) => key !== 'handler' && key !== 'default')
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

    let event;
    if (request.action) {
      event = {
        t: 'event',
        ec: host,
        ea: request.actionName,
        el: response.statusCode,
        ev: serialize({ ...request.action, ...request.options }),
      };
    } else {
      event = {
        t: 'pageview',
        dh: host,
        dp: String(url),
        dt: method,
      };
    }

    const data = {
      v: '1',
      tid: process.env.GA_TRACKING_ID,
      cid: '2',
      ...event,
    };

    try {
      const body = String(new URLSearchParams(Object.entries(data)));
      const http = post('http://www.google-analytics.com/collect', { method: 'POST' });
      http.write(body);
      http.end();
    } catch (error) {
      this.logError(null, error);
    }
  }
}
