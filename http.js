import { createServer, request as post } from 'http';
import { Format, uid, toJson, serialize, tryToParseJson, timestamp, HttpMethod as Http } from './common.js';

/**
 * @param {Format} configuration.input
 * @param {Format} configuration.output
 * @param {Function} main                         (input, output) => void;
 */
export const lambda = (configuration) => new HttpServer(configuration);

export class HttpServer {
  constructor() {
    this.server = createServer((request, response) => this.dispatch(request, response));
    this.server.listen(process.env.PORT);
  }

  async dispatch(request, response) {
    try {
      const { method } = request;
      switch (true) {
        case method === Http.Options:
          this.sendCorsPreflight(request, response);
          break;

        case method === Http.Get:
          this.sendLambdaDocumentation(request, response);
          break;

        case method !== Http.Post:
          this.sendMethodNotAllowed(request, response);
          break;

        default:
          return this.executeLambda(request, response);
      }

      this.track(request, response);
    } catch (error) {
      this.logError(request.id, error);
      response.send(error);
    }
  }

  async executeLambda(request, response) {
    this.setCorsHeaders(request, response);
    this.onPrepare(request, response);

    await this.prepareInputAndOutput(request, response);

    if (request.body === null && request.input === Format.Json) {
      response.reject('Invalid JSON');
      return null;
    }

    return this.onRun(request, response);
  }

  onPrepare() {}
  onRun() {}

  onPipe(response, value) {
    response.header('x-next', value);
  }

  onError(response, error) {
    this.logError(response.id, error);
    response.writeHead(500);
    response.end('');
  }

  onSend(response, value) {
    const body = this.serialize(value, response.output);
    response.end(body);

    this.logRequest(response, body);
    this.track(response.request, response);
  }

  sendMethodNotAllowed(_, response) {
    response.writeHead(405);
    response.end();
  }

  sendCorsPreflight(request, response) {
    this.setCorsHeaders(request, response);
    response.end();
  }

  sendLambdaDocumentation(request, response) {
    const host = request.headers['host'] || '';

    response.setHeader(
      'Location',
      'https://github.com/node-lambdas/' + (host.endsWith('.jsfn.run') ? host.replace('.jsfn.run', '') : ''),
    );

    response.writeHead(302);
    response.end();
  }

  async prepareInputAndOutput(request, response) {
    request.id = response.id = uid();
    response.request = request;

    await this.augmentRequest(request);
    await this.augmentResponse(response);
  }

  async augmentRequest(request) {
    if (request.method === Http.Post && !!request.input) {
      await this.readRequest(request);
    }
  }

  async augmentResponse(response) {
    response.header = (name, value) => (response.setHeader(name, value), response);
    response.send = (status, body) => this.writeResponse(response, status, body);
    response.reject = (message) => this.writeResponse(response, 400, String(message || 'Invalid input') + '\n');
    response.pipeTo = (value) => this.onPipe(response, value);
  }

  writeResponse(response, status, body) {
    response.header('X-Trace-Id', response.id);

    if (body === undefined && typeof status !== 'number') {
      body = status;
      status = 200;
    }

    if (body instanceof Promise) {
      body.then(
        (value) => this.onSend(response, value),
        (error) => this.onError(response, error),
      );
      return;
    }

    if (body instanceof Error) {
      this.onError(response, body);
      return;
    }

    if (arguments.length === 2 || typeof status === 'number') {
      response.writeHead(status);
      this.onSend(response, body);
      return;
    }

    this.onSend(response, status);
  }

  async readRequest(request) {
    return new Promise((resolve) => {
      let chunks = [];

      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const inputFormat = request.input;

        switch (inputFormat) {
          case Format.Json:
            request.body = tryToParseJson(buffer.toString('utf8'));
            break;

          case Format.Text:
            request.body = buffer.toString('utf8');
            break;

          case Format.Buffer:
          default:
            request.body = buffer;
            break;
        }

        resolve();
      });
    });
  }

  setCorsHeaders(_, response) {
    response.setHeader('access-control-allow-origin', '*');
  }

  serialize(value, format) {
    switch (format) {
      case Format.Json:
        return toJson(value);

      case Format.Text:
        return value.toString ? value.toString('utf8') : String(value);

      case Format.Buffer:
      default:
        return Buffer.isBuffer(value) ? value : String(value);
    }
  }

  logError(traceId, error) {
    console.log('[error]', timestamp(), traceId, error);
  }

  logRequest(response, responseBody) {
    const { url, body, id } = response.request;

    const inputBody = serialize(body);
    const outputBody = serialize(responseBody);

    console.log('[info]', timestamp(), id, [String(url), inputBody, response.statusCode, outputBody]);
  }

  track(request, response) {
    if (!process.env.GA_TRACKING_ID) return;

    const { host } = request.headers;
    const { url, method } = request;
    const data = {
      v: '1',
      tid: process.env.GA_TRACKING_ID,
      cid: '1',
      category: host,
      action: String(url),
      label: method,
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
