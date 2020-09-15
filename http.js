import { createServer, request as http } from 'http';
import { request as https } from 'https';
import { Format, uid, toJson, tryToParseJson, timestamp, HttpMethod as Http } from './common.js';
import { Console } from './console.js';

// From https://github.com/nodejs/node/blob/master/lib/_http_server.js#L85
export const HttpStatus = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  OK: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  IMUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  URITooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImaTeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HTTPVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  BandwidthLimitExceeded: 509,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
};

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
        case method === Http.Options && request.url === '/api':
          this.setCorsHeaders(request, response);
          response.end(JSON.stringify(this.describeApi(), null, 2));
          break;

        case method === Http.Options:
          this.sendCorsPreflight(request, response);
          break;

        case method === Http.Head && request.url === '/health':
          return this.sendHealthCheckResponse(request, response);

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
      response.writeHead(500);
      response.end('Internal function error');
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
  describeApi() {}

  onPipe(response, value) {
    response.header('x-next', value);
    response.end();

    this.logRequest(response);
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
  }

  sendMethodNotAllowed(_, response) {
    response.setHeader('Connection', 'close');
    response.writeHead(405);
    response.end('');
  }

  sendCorsPreflight(request, response) {
    this.setCorsHeaders(request, response);
    response.end();
  }

  sendHealthCheckResponse(request, response) {
    response.setHeader('Connection', 'close');
    response.writeHead(200);
    response.end();
  }

  sendLambdaDocumentation(request, response) {
    const host = request.headers['host'] || '';

    response.setHeader(
      'Location',
      'https://jsfn.run/?' + (host.endsWith('.jsfn.run') ? host.replace('.jsfn.run', '') : ''),
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
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
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
    Console.error('[error]', timestamp(), traceId, error);
  }

  logRequest(response) {
    const { url, id } = response.request;

    Console.info('[info]', timestamp(), id, String(url), response.statusCode);
    this.track(response.request, response);
  }
}

function onFetch(resolve, reject) {
  return (response) => {
    if (response.statusCode !== 200) {
      reject(new Error(response.statusCode));
      return;
    }

    resolve(response);
  };
}

export function fetch(url, options) {
  if (typeof url === 'string') {
    url = new URL(url);
  }

  return new Promise((resolve, reject) => {
    const fn = url.protocol === 'http:' ? http : https;
    const request = fn(url, options, onFetch(resolve, reject));

    if (options?.body) {
      request.write(options.body);
    }

    request.end();
  });
}
