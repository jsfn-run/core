import type { IncomingMessage, ServerResponse } from 'node:http';

export type Format = 'json' | 'text' | 'buffer' | 'raw' | 'dom';

export interface Configuration {
  description?: string;
  actions: Record<string, Action>;
}

export interface Request<T = any> extends IncomingMessage {
  parsedUrl: URL;
  options: any;
  action: Action;
  actionName: string;
  credentials: Record<string, string>;
  input: Format;
  body?: T;
  asBuffer: () => Promise<Buffer>;
  asText: () => Promise<string>;
  asJson: () => Promise<any>;
}

export interface Response<T = any> extends ServerResponse {
  request: Request;
  output: Format;
  header: (name: string, value: string) => void;
  send: (status: number | T, body?: T) => void;
  reject: (message: string) => void;
  pipeTo: (nextCommand: string) => void;
  sendBuffer: (b: Buffer) => void;
  sendText: (b: string) => void;
  sendJson: (b: any) => void;
}

export interface ActionDescription {
  name: string;
  description?: string;
  input: Format;
  output: Format;
  credentials: string[];
  options: Record<string, string>;
  default?: boolean;
}

export interface ApiDescription {
  description: string;
  actions: ActionDescription[];
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
  input?: 'json';
  handler: ActionHandler<object>;
}

interface BufferAction extends BaseAction {
  input?: 'buffer';
  handler: ActionHandler<Buffer>;
}

interface TextAction extends BaseAction {
  input?: 'text';
  handler: ActionHandler<string>;
}

interface RawAction extends BaseAction {
  input?: 'raw';
  handler: ActionHandler<undefined>;
}

export type Action = JsonAction | BufferAction | TextAction | RawAction;