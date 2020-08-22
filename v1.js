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

    request.input = input;
    response.output = output;
  }

  onRun(request, response) {
    return this.handler(request, response);
  }

  getConfiguration(configuration) {
    return configuration;
  }
}
