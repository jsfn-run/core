declare module '@node-lambdas/core' {
  export enum Format {
    Json = 'json',
    Buffer = 'buffer',
    Text = 'text',
    Raw = 'raw',
  }

  export interface ActionInput<T extends string | object | Buffer | undefined> {
    body: T;
    credentials: Record<string, string>;
    pipe<T>(next: T): T;
  }

  export interface ActionOutput {
    reject(error: any): void;
    header(name: string, value: string): void;
    send(body?: string | Promise<any> | object | Error): void;
    send(status: number, body?: string | Promise<any> | object): void;
    pipeTo(nextCommand: string): void;
  }

  export interface ActionHandler<T extends string | object | Buffer | undefined> {
    (input: ActionInput<T>, output: ActionOutput): void;
  }

  interface BaseAction {
    default?: boolean;
    credentials?: string[];
    options?: Record<string, string>;
    output?: Format;
  }

  interface JsonAction extends BaseAction {
    input: Format.Json;
    handler: ActionHandler<object>;
  }

  interface BufferAction extends BaseAction {
    input: Format.Buffer;
    handler: ActionHandler<Buffer>;
  }

  interface TextAction extends BaseAction {
    input: Format.Text;
    handler: ActionHandler<string>;
  }

  interface RawAction extends BaseAction {
    input: Format.Raw;
    handler: ActionHandler<undefined>;
  }

  export type Action = JsonAction | BufferAction | TextAction | RawAction;

  export function lambda(configuration: {
    version: 1;
    input?: Format;
    output?: Format;
    handler: ActionHandler<any>;
  }): void;

  export function lambda(configuration: { version: 2; actions: Record<string, Action> }): void;

  export function uid(): string;

  export interface Console {
    log(...args: any[]): void;
    info(...args: any[]): void;
    error(...args: any[]): void;
  }

  export const Console: Console;

  export const HttpStatus: {
    Continue: 100;
    SwitchingProtocols: 101;
    Processing: 102;
    EarlyHints: 103;
    OK: 200;
    Created: 201;
    Accepted: 202;
    NonAuthoritativeInformation: 203;
    NoContent: 204;
    ResetContent: 205;
    PartialContent: 206;
    MultiStatus: 207;
    AlreadyReported: 208;
    IMUsed: 226;
    MultipleChoices: 300;
    MovedPermanently: 301;
    Found: 302;
    SeeOther: 303;
    NotModified: 304;
    UseProxy: 305;
    TemporaryRedirect: 307;
    PermanentRedirect: 308;
    BadRequest: 400;
    Unauthorized: 401;
    PaymentRequired: 402;
    Forbidden: 403;
    NotFound: 404;
    MethodNotAllowed: 405;
    NotAcceptable: 406;
    ProxyAuthenticationRequired: 407;
    RequestTimeout: 408;
    Conflict: 409;
    Gone: 410;
    LengthRequired: 411;
    PreconditionFailed: 412;
    PayloadTooLarge: 413;
    URITooLong: 414;
    UnsupportedMediaType: 415;
    RangeNotSatisfiable: 416;
    ExpectationFailed: 417;
    ImaTeapot: 418;
    MisdirectedRequest: 421;
    UnprocessableEntity: 422;
    Locked: 423;
    FailedDependency: 424;
    TooEarly: 425;
    UpgradeRequired: 426;
    PreconditionRequired: 428;
    TooManyRequests: 429;
    RequestHeaderFieldsTooLarge: 431;
    UnavailableForLegalReasons: 451;
    InternalServerError: 500;
    NotImplemented: 501;
    BadGateway: 502;
    ServiceUnavailable: 503;
    GatewayTimeout: 504;
    HTTPVersionNotSupported: 505;
    VariantAlsoNegotiates: 506;
    InsufficientStorage: 507;
    LoopDetected: 508;
    BandwidthLimitExceeded: 509;
    NotExtended: 510;
    NetworkAuthenticationRequired: 511;
  };
}
