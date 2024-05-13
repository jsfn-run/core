import { createServer } from 'http';
import { pipe, fn } from './index.js';

const port = 12345;
let server;

beforeAll(() => {
  server = createServer((req, res) => req.pipe(res)).listen(port);
});

afterAll(() => {
  server.close();
});

describe('pipe function calls', () => {
  it('should throw an error if no steps are provided', () => {
    expect(() => pipe()).toThrowError('One or more steps must be provided');
  });

  it('should pipe a single step', () => {
    const step = fn({ name: 'yaml', action: 'encode' });
    expect(pipe(step)).toBe(step);
  });

  it('should pipe multiple function calls together', async () => {
    const steps = [
      fn({ name: 'yaml', action: 'encode', port, local: true }),
      { name: 'yaml', action: 'decode', credentials: { accessToken: 'deadbeef' }, port, local: true },
    ];

    const pipeline = pipe(...steps);
    const json = '{"hello": true}';
    const input = new Blob([json]);
    // const fetch = (globalThis.fetch = jest.fn(() => Promise.resolve(new Response(new Blob([input])))));
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const response = pipeline(input);

    await expect(response).resolves.toBeInstanceOf(Response);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:12345/encode?', {
      body: input,
      method: 'POST',
      headers: {},
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:12345/decode?', {
      body: expect.any(Object),
      method: 'POST',
      duplex: 'half',
      headers: { Authorization: 'Bearer eyJhY2Nlc3NUb2tlbiI6ImRlYWRiZWVmIn0=' },
    });

    await expect((await response).text()).resolves.toEqual(json);
  });

  it('should pipe the input to a local server', async () => {
    const json = JSON.stringify({ number: 1 }, null, 2);
    const input = new Blob([json], { type: 'application/json' });
    const fetch = (globalThis.fetch = jest.fn(() => Promise.resolve(new Response(input))));

    const response = await fn({ local: true, port: 2233 })(input);

    expect(await response.text()).toBe(json);
    expect(fetch).toHaveBeenCalledWith('http://localhost:2233/?', { body: input, method: 'POST', headers: {} });
  });

  it('should stop calls if one step returns an error', async () => {
    const input = new Blob(['Invalid input'], { type: 'text/plain' });
    const response = new Response(input, { status: 400, statusText: 'Error' });
    const fetch = (globalThis.fetch = jest.fn(() => Promise.resolve(response)));

    await await expect(pipe({ local: true }, { name: 'yaml', action: 'encode' })(input)).rejects.toThrowError(
      'Invalid input',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://localhost/?', { body: input, method: 'POST', headers: {} });
  });
});
