import { lambda as v1 } from './v1.js';
import { lambda as v2 } from './v2.js';
export { Format, uid } from './common.js';
export { Console } from './console.js';
export { HttpStatus, fetch } from './http.js';

export function lambda(configuration: {
  version: 1;
  input?: Format;
  output?: Format;
  handler: ActionHandler<any>;
}): void;

export function lambda(configuration: {
  version: 2; 
  actions: Record<string, Action>
}): void;

export function lambda(configuration) {
  switch (configuration.version || 1) {
    case 1:
      return v1(configuration);

    case 2:
      return v2(configuration);
  }
}

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

async function main() {
  const fn = await import('/home/app/index.js');
  lambda(fn);
}

main();