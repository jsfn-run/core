import { randomBytes } from 'crypto';

export const Format = {
  Text: 'text',
  Json: 'json',
  Buffer: 'buffer',
};

export const HttpMethod = {
  Get: 'GET',
  Options: 'OPTIONS',
  Post: 'POST',
  Head: 'HEAD',
};

export const uid = (size = 16) => randomBytes(size).toString('hex');
export const toJson = (x, inOneLine = false) => JSON.stringify(x, null, inOneLine ? 0 : 2);
export const serializeError = (error) => (error && error instanceof Error ? error.stack : String(error));
export const timestamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const tryToParseJson = (data) => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
