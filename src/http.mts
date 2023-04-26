import { IncomingMessage, ServerResponse, createServer } from 'http';
import { uid, toJson, tryToParseJson, timestamp, HttpMethod as Http } from './common.mjs';
import { Console } from './console.mjs';

export type Format = 'json' | 'text' | 'buffer' | 'raw';

export class Request<T = any> extends IncomingMessage {
  id: string;
  input: Format;
  body?: T;
}

export class Response<T = any> extends ServerResponse {
  id: string;
  request: Request;
  output: Format;
  header: (name: string, value: string) => void;
  send: (status: number | T, body?: T) => void;
  reject: (message: string) => void;
  pipeTo: (nextCommand: string) => void;
}

export interface ApiDescription {
  name: string;
  description?: string;
  input: Format;
  output: Format;
  credentials: string[];
  options: Record<string, string>;
  default?: boolean;
}

export interface ActionHandler<T extends string | object | Buffer | undefined> {
  (input: Request<T>, output: Response<T>): void;
}

interface BaseAction {
  default?: boolean;
  credentials?: string[];
  options?: Record<string, string>;
  output?: Format;
  description?: string;
}

interface JsonAction extends BaseAction {
  input: 'json';
  handler: ActionHandler<object>;
}

interface BufferAction extends BaseAction {
  input: 'buffer';
  handler: ActionHandler<Buffer>;
}

interface TextAction extends BaseAction {
  input: 'text';
  handler: ActionHandler<string>;
}

interface RawAction extends BaseAction {
  input: 'raw';
  handler: ActionHandler<undefined>;
}

export type Action = JsonAction | BufferAction | TextAction | RawAction;

export abstract class HttpServer {
  server: any;

  constructor() {
    this.server = createServer((request, response) => this.dispatch(request, response));
    this.server.listen(process.env.PORT);
  }

  abstract onPrepare(_request: IncomingMessage, _response: ServerResponse): void;
  abstract onRun(_request: Request, _response: Response): void;
  abstract describeApi(): ApiDescription[];

  async dispatch(request: IncomingMessage, response: ServerResponse) {
    try {
      const { method } = request;

      switch (true) {
        case method === Http.Get: {
          if (request.url === '/index.mjs' || request.url === '/index.js') {
            return this.sendEsModule(request, response);
          }

          return this.sendLambdaDocumentation(request, response);
        }

        case method === Http.Options: {
          if (request.url === '/api') {
            return this.sendApiDescription(request, response);
          }

          return this.sendCorsPreflight(request, response);
        }

        case method === Http.Head && request.url === '/health':
          return this.sendHealthCheckResponse(request, response);

        case method !== Http.Post:
          return this.sendMethodNotAllowed(request, response);

        default:
          return this.executeLambda(request, response);
      }
    } catch (error) {
      this.logError((request as any).id, error);
      response.writeHead(500);
      response.end('Internal function error');
    }
  }

  async sendApiDescription($request: IncomingMessage, $response: ServerResponse) {
    this.setCorsHeaders($request, $response);
    const description = this.describeApi();
    Console.debug(description);
    $response.end(JSON.stringify(description, null, 2));
  }

  async sendEsModule(_request: IncomingMessage, $response: ServerResponse) {
    const description = this.describeApi();
    const fnName = process.env.FN_NAME;
    const outputMap = { json: '.json()', text: '.text()' };
    const lines = description.map(_ =>
      [(_.default ? 'export default ' : ''),
      `async function ${_.name}(input, options = {}) {`,
      `${_.input === 'json' && 'input = JSON.stringify(input)' || ''}`,
      `const response = await fetch('https://${fnName}.jsfn.run/${_.name}?' + search(options), { method: 'POST', body: input });`,
      `return response${outputMap[_.output] || ''};}`,
      ].join(''));

    lines.push(`const search = (o) => Object.entries(o).map(([k, v]) => k+'='+v).join('&');`)
    lines.push('export { ' + description.map(f => f.name).join(', ') + ' }');

    $response.end(lines.join('\n'));
  }

  async executeLambda($request: IncomingMessage, $response: ServerResponse) {
    this.setCorsHeaders($request, $response);
    this.onPrepare($request, $response);

    const { request, response } = await this.prepareInputAndOutput($request, $response);

    if (request.body === null && request.input === 'json') {
      response.reject('Invalid JSON');
      return null;
    }

    return this.onRun(request, response);
  }

  onPipe(response: Response, value: string) {
    response.header('x-next', value);
    response.end();

    this.logRequest(response);
  }

  onError(response: Response, error) {
    this.logError(response.id, error);
    response.writeHead(500);
    response.end('');
  }

  onSend(response: Response, status: number, value: any) {
    const body = this.serialize(value, response.output);

    response.writeHead(status);
    response.end(body);

    this.logRequest(response);
  }

  sendMethodNotAllowed(_request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Connection', 'close');
    response.writeHead(405);
    response.end('');
  }

  sendCorsPreflight(request: IncomingMessage, response: ServerResponse) {
    this.setCorsHeaders(request, response);
    response.end();
  }

  sendHealthCheckResponse(_request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Connection', 'close');
    response.writeHead(200);
    response.end();
  }

  sendLambdaDocumentation(_request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Location', 'https://jsfn.run/?fn=' + process.env.FN_NAME);
    response.writeHead(302);
    response.end();
  }

  async prepareInputAndOutput($request: IncomingMessage, $response: ServerResponse) {
    const request = $request as Request;
    const response = $response as Response;

    request.id = response.id = uid();
    response.request = request;

    await this.augmentRequest(request);
    await this.augmentResponse(response);

    return { request, response };
  }

  async augmentRequest(request: Request) {
    if (request.method === Http.Post && !!request.input) {
      await this.readRequest(request);
    }
  }

  async augmentResponse(response: Response) {
    response.header = (name: string, value: string) => (response.setHeader(name, value), response);
    response.send = (status: number | any, body?: any) => this.writeResponse(response, status, body);
    response.reject = (message: string) => this.writeResponse(response, 400, String(message || 'Invalid input') + '\n');
    response.pipeTo = (value: string) => this.onPipe(response, value);
  }

  writeResponse<T>(response: Response, status: number | T, body?: T) {
    response.header('X-Trace-Id', response.id);

    if (typeof body === 'undefined' && typeof status !== 'number') {
      body = status as T;
      status = 200;
    }

    if (body instanceof Promise) {
      body.then(
        (value) => this.onSend(response, status as number, value),
        (error) => this.onError(response, error),
      );
      return;
    }

    if (body instanceof Error) {
      this.onError(response, body);
      return;
    }

    this.onSend(response, status as number, body);
  }

  async readRequest(request) {
    return new Promise((resolve) => {
      let chunks = [];

      if (!['json', 'text', 'buffer'].includes(request.input)) {
        resolve(null);
        return;
      }

      request.on('data', (chunk: any) => chunks.push(chunk));
      request.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const inputFormat = request.input;

        switch (inputFormat) {
          case 'json':
            request.body = tryToParseJson(buffer.toString('utf8'));
            break;

          case 'text':
            request.body = buffer.toString('utf8');
            break;

          case 'buffer':
          default:
            request.body = buffer;
            break;
        }

        resolve(null);
      });
    });
  }

  setCorsHeaders(_request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  }

  serialize(value: any, format: Format) {
    switch (format) {
      case 'json':
        return toJson(value);

      case 'text':
        return value && value.toString ? value.toString('utf8') : String(value);

      case 'buffer':
      default:
        return Buffer.isBuffer(value) ? value : String(value);
    }
  }

  logError(traceId, error) {
    Console.error('[error]', timestamp(), traceId, error);
  }

  logRequest(response: Response) {
    const { url, id } = response.request;

    Console.info('[info]', timestamp(), id, String(url), response.statusCode);
  }
}
