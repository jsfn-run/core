import { randomBytes } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { Console } from './console.mjs';
import { ApiDescription, Format, Request, Response } from './types.mjs';

export abstract class HttpServer {
  server: any;

  constructor() {
    this.server = createServer((request, response) => this.dispatch(request, response));
    this.server.listen(process.env.PORT);
  }

  abstract onPrepare(_request: IncomingMessage, _response: ServerResponse): void;
  abstract onRun(_request: Request, _response: Response): void;
  abstract describeApi(): ApiDescription;

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
            return this.sendApiDescription(request, response);
          }

          return this.sendCorsPreflight(request, response);
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

  async sendApiDescription($request: IncomingMessage, $response: ServerResponse) {
    this.setCorsHeaders($request, $response);
    const description = this.describeApi();
    $response.end(JSON.stringify(description, null, 2));
  }

  async sendEsModule($request: IncomingMessage, $response: ServerResponse) {
    const description = this.describeApi();
    const fnName = String($request.headers['x-forwarded-for'] || '').replace('.jsfn.run', '');
    const outputMap = {
      json: 'response.json()',
      text: 'response.text()',
      dom: '__d(await response.text())',
    };

    const lines = description.actions.map((_) =>
      [
        _.default ? 'export default ' : '',
        `async function ${_.name}(i,o = {}) {`,
        `${(_.input === 'json' && 'i=JSON.stringify(i||{});') || ''}`,
        `const response=await fetch('https://${fnName}.jsfn.run/${_.name}?' + __s(o),{mode:'cors',method:'POST',body:i});`,
        `return ${outputMap[_.output] || 'response'};}`,
      ].join(''),
    );

    lines.push(`const __s=(o={})=>new URLSearchParams(o).toString();`);
    if (description.actions.find((a) => a.output === 'dom')) {
      lines.push(`const __d=(h,t,s,z,d=document)=>{
t=d.createElement('template');t.innerHTML=h;z=t.content.cloneNode(true);t=[];
z.querySelectorAll('script,style').forEach(n=>{
s=d.createElement(n.nodeName.toLowerCase());
s.innerHTML=n.innerHTML;s.type=n.type;t.push(s);n.remove();
});return [...z.childNodes,...t].map(n=>d.body.append(n)),''}`);
    }
    lines.push('export { ' + description.actions.map((f) => f.name).join(', ') + ' }');

    this.setCorsHeaders($request, $response);
    $response.setHeader('content-type', 'text/javascript');
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

    try {
      return this.onRun(request, response);
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
    Console.error('[error]', timestamp(), (response as any).id, error);
    response.writeHead(500, { 'X-Trace-Id': (response as any).id });
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

  sendLambdaDocumentation(request: IncomingMessage, response: ServerResponse) {
    const host = String(request.headers['x-forwarded-for'] || '');
    const name = host.replace('.jsfn.run', '');

    response.setHeader('Location', 'https://jsfn.run/?fn=' + name);
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

  logRequest(response: Response) {
    const { url, id } = response.request;

    Console.info('[info]', timestamp(), id, String(url), response.statusCode);
  }
}

const uid = (size = 16) => randomBytes(size).toString('hex');
const toJson = (x: any, inOneLine = false) => JSON.stringify(x, null, inOneLine ? 0 : 2);
const timestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const tryToParseJson = (data: string) => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
