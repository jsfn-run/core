import { Format, ActionHandler, HttpServer, Request, Response } from './http.mjs';

export interface Configuration {
  version: 1;
  input?: Format;
  output?: Format;
  handler: ActionHandler<any>;
}

export const lambda = (configuration: Configuration) => new V1(configuration);

export class V1 extends HttpServer {
  constructor(protected configuration: Configuration) {
    super();
  }

  onPrepare(request: Request, response: Response) {
    const { input, output } = this.configuration;

    request.input = input;
    response.output = output;
  }

  onRun(request: Request, response: Response) {
    return this.configuration.handler(request, response);
  }

  describeApi() {
    const { input, output } = this.configuration;
    const defaultAction = { input: input || 'raw', output: output || 'raw', credentials: [], options: {} };

    return [defaultAction];
  }
}
