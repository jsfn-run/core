import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { Console } from './console.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Action, Configuration, Format, Request, Response } from './types.mjs';
import {
  describeApi,
  generateEsModule,
  parseOption,
  readCredentials,
  setCorsHeaders,
  timestamp,
  tryToParseJson,
} from './utils.mjs';

export class HttpServer {
  server: ReturnType<typeof createServer>;
  readonly actions: Record<string, Action>;

  constructor(protected configuration: Configuration) {
    if (!configuration.actions) {
      throw new Error('No actions were provided in the current configuration');
    }

    this.server = createServer((request, response) => this.dispatch(request, response));
    this.server.listen(process.env.PORT);

    const { actions } = this.configuration;
    this.actions = { ...actions };
    this.setDefaultAction();
  }

  setDefaultAction() {
    const keys = Object.keys(this.actions);

    if (keys.length === 1) {
      this.actions.default = this.actions[keys[0]];
      return;
    }

    keys.some((actionName) => {
      if (this.actions[actionName].default) {
        this.actions.default = this.actions[actionName];
        return true;
      }
    });
  }

  async prepareAction($request: IncomingMessage, $response: ServerResponse) {
    setCorsHeaders($response);

    const request = $request as Request;
    const response = $response as Response;
    response.request = request;
    const action = this.readAction(request, response);

    await this.augmentRequest(request);
    await this.augmentResponse(response);

    if (action) {
      readCredentials(request);
    }

    return { request, response };
  }

  async augmentRequest(request: Request) {
    request.asBuffer = () => this.readStream(request);
    request.asText = async () => (await request.asBuffer()).toString('utf-8');
    request.asJson = async () => JSON.parse(await request.asText());

    if (request.method === 'POST' && !!request.input) {
      await this.readRequest(request);
    }
  }

  async augmentResponse(response: Response) {
    response.header = (name: string, value: string) => (response.setHeader(name, value), response);
    response.send = (status: number | any, body?: any) => this.writeResponse(response, status, body);
    response.reject = (message: string) => this.writeResponse(response, 400, String(message || 'Invalid input') + '\n');
    response.pipeTo = (name: string, params?: Record<string, any>, action?: string) => {
      const json = JSON.stringify({
        name,
        params,
        inputs: action ? [action] : undefined,
      });
      this.onPipe(response, Buffer.from(json).toString('base64'));
    };

    response.sendBuffer = (b: Buffer) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(b);
    };

    response.sendText = (b: string) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(b);
    };

    response.sendJson = (b: any) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(b));
    };
  }

  readAction(request: Request, response: Response) {
    const parsedUrl = new URL(request.url, 'http://localhost');
    const actionName = parsedUrl.pathname.slice(1) || 'default';
    const action = this.actions[actionName] || null;

    if (!action) return;

    const { input, output } = action;
    const options = Array.from(parsedUrl.searchParams.entries()).map(([key, value]) => [key, parseOption(value)]);

    Object.assign(request, {
      options: Object.fromEntries(options),
      action,
      actionName,
      input,
      credentials: {},
    });

    response.output = output;

    return action;
  }

  async dispatch(request: IncomingMessage, response: ServerResponse) {
    try {
      const { method } = request;

      switch (true) {
        case method === 'GET': {
          if (request.url === '/index.mjs' || request.url === '/index.js') {
            return this.sendEsModule(request, response);
          }

          return this.sendLambdaDocumentation(request, response);
        }

        case method === 'OPTIONS': {
          if (request.url === '/api') {
            return this.sendApiDescription(response);
          }

          setCorsHeaders(response);
          response.end();
          return;
        }

        case method === 'HEAD' && request.url === '/health':
          return this.sendHealthCheckResponse(request, response);

        case method !== 'POST':
          return this.sendMethodNotAllowed(request, response);

        default:
          return this.executeLambda(request, response);
      }
    } catch (error) {
      this.onError(response, error);
    }
  }

  async sendApiDescription(response: ServerResponse) {
    setCorsHeaders(response);
    const description = describeApi(this.configuration);
    response.end(JSON.stringify(description, null, 2));
  }

  async sendEsModule(request: IncomingMessage, response: ServerResponse) {
    const fnName = String(request.headers['x-forwarded-for'] || '').replace('.jsfn.run', '');
    const code = generateEsModule(this.configuration, fnName);
    setCorsHeaders(response);
    response.setHeader('content-type', 'text/javascript');
    response.end(code);
  }

  async executeLambda($request: IncomingMessage, $response: ServerResponse) {
    const { request, response } = await this.prepareAction($request, $response);

    if (request.body === null && request.input === 'json') {
      response.reject('Invalid JSON');
      return null;
    }

    try {
      if (!request.action) {
        response.reject('Invalid action');
        return;
      }

      if (!request.action.handler) {
        response.reject('Not implemented');
        return;
      }

      request.action.handler(request, response);
    } catch (error) {
      if (!response.headersSent) {
        return response.reject(String(error));
      }

      if (!response.closed) {
        return response.end();
      }
    }
  }

  onPipe(response: Response, base64Header: string) {
    response.header('x-next', base64Header);
    response.end();

    this.logRequest(response);
  }

  onError(response: ServerResponse, error: any) {
    Console.error('[error]', timestamp(), error);
    response.writeHead(500, 'Function error');
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

  sendCorsPreflight(response: ServerResponse) {
    setCorsHeaders(response);
    response.end();
  }

  sendHealthCheckResponse(_request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Connection', 'close');
    response.writeHead(200);
    response.end();
  }

  async sendLambdaDocumentation(request: IncomingMessage, response: ServerResponse) {
    const functionName = String(request.headers['x-forwarded-for'] || '').replace('.jsfn.run', '');
    const indexFile = process.cwd() + '/index.html';
    if (existsSync(indexFile)) {
      const file = await readFile(indexFile, 'utf-8');
      response.end(file);
      return;
    }

    response.setHeader('Location', 'https://jsfn.run/?fn=' + functionName);
    response.writeHead(302);
    response.end();
  }

  writeResponse<T>(response: Response, status: number | T, body?: T) {
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

  async readStream(stream: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('error', reject);
      stream.on('close', reject);
      stream.on('data', (chunk: any) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async readRequest(request) {
    return new Promise(async (resolve) => {
      if (!['json', 'text', 'buffer'].includes(request.input)) {
        resolve(null);
        return;
      }

      const buffer = await this.readStream(request);
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
  }

  serialize(value: any, format: Format) {
    switch (format) {
      case 'json':
        return JSON.stringify(value);

      case 'text':
        return value && value.toString ? value.toString('utf8') : String(value);

      case 'buffer':
      default:
        return Buffer.isBuffer(value) ? value : String(value);
    }
  }

  logRequest(response: Response) {
    const { url } = response.request;

    Console.info('[info]', timestamp(), String(url), response.statusCode);
  }
}
