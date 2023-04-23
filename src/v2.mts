import { HttpServer, Request, Response, Action, ActionHandler } from './http.mjs';

export interface Configuration {
  version: 2;
  actions: Record<string, Action>
}

export class V2Request extends Request {
  parsedUrl: URL;
  options: any;
  action: Action;
  actionName: string;
  credentials: Record<string, string>;
}

export const lambda = (configuration: Configuration) => new V2(configuration);

export class V2 extends HttpServer {
  readonly actions: Record<string, Action>;

  constructor(protected configuration: Configuration) {
    super();

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
      let { input = 'raw', output = 'raw', credentials = [], options = {} } = value;
      const action = {
        name: key,
        input: input,
        output: output,
        credentials: credentials,
        options: options,
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

  onPrepare($request: Request, response: Response) {
    const request = $request as V2Request;
    request.parsedUrl = new URL('http://localhost' + request.url);

    const actionName = request.parsedUrl.pathname.slice(1) || 'default';
    const action = this.actions[actionName] || null;

    if (!action) return;

    const { input, output } = action;
    request.options = Object.fromEntries(request.parsedUrl.searchParams.entries());
    request.action = action;
    request.actionName = actionName;
    request.input = input;
    request.credentials = {};

    response.output = output;

    this.readCredentials(request, action);
  }

  readCredentials(request: V2Request, action: Action) {
    const requiredCredentials = action.credentials || [];

    if (requiredCredentials.length && request.headers.authorization) {
      const token = request.headers.authorization.replace(/\s*Bearer\s*/, '').trim();
      const json = Buffer.from(token, 'base64').toString('utf-8');
      const credentials = JSON.parse(json);

      requiredCredentials.forEach((key) => (request.credentials[key] = credentials[key]));
    }
  }

  onRun(request: V2Request, response: Response) {
    if (!request.action) {
      response.reject('Invalid action');
      return;
    }

    this.getHandler(request.action)(request, response);
  }

  getHandler(action: Action): ActionHandler<any> {
    return action.handler || ((_, response) => response.reject('Not implemented'));
  }
}
