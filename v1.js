import { Format } from './common.js';
import { HttpServer } from './http.js';

/**
 * @param {Format} configuration.input
 * @param {Format} configuration.output
 * @param {Function} main                         (input, output) => void;
 */
export const lambda = (configuration, main) => new V1(configuration, main);

export class V1 extends HttpServer {
  constructor(configuration) {
    super();
    this.configuration = configuration;
  }

  onPrepare(request, response) {
    const { input, output } = this.configuration;

    request.input = input;
    response.output = output;
  }

  onRun(request, response) {
    return this.configuration.handler(request, response);
  }

  describeApi() {
    const { input, output } = this.configuration;
    const defaultAction = { input: input || 'raw', output: output || 'raw', credentials: [], options: {} };

    return [defaultAction];
  }

  track(request, response) {
    console.log('track');
    if (!process.env.GA_TRACKING_ID) return;

    const { host } = request.headers;
    const { url, method } = request;
    let event = {};

    if (method === 'POST') {
      event = {
        t: 'event',
        ec: host,
        ea: method + ' ' + String(url),
        el: response.statusCode,
        ev: '',
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

    console.log(data);
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
