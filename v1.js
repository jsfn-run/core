import { Format } from './common.js';
import { HttpServer } from './http.js';

/**
 * @param {Format} configuration.input
 * @param {Format} configuration.output
 * @param {Function} main                         (input, output) => void;
 */
export const lambda = (configuration, main) => new V1(configuration, main);

export class V1 extends HttpServer {
  constructor(configuration, handler) {
    super();
    this.configuration = this.getConfiguration(configuration);
    this.handler = handler;
  }

  onPrepare(request, response) {
    const { input, output } = this.configuration;
    console.log(input, output);
    request.input = input;
    response.output = output;
  }

  onRun(request, response) {
    if (request.body === null && request.input === Format.Json) {
      response.reject('Invalid JSON');
      return;
    }

    return this.handler(request, response);
  }

  getConfiguration(configuration) {
    return configuration;
  }
}
