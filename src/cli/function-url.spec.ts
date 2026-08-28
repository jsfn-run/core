import { describe, expect, it } from 'vitest';
import { buildFunctionUrl } from './common.js';
import { CliInputs } from './options.js';

describe('buildFunctionUrl', () => {
  it('should build an URL from inputs', () => {
    const inputs: CliInputs = {
      options: {},
      params: {},
      name: 'test',
      inputs: [],
    };

    const url = buildFunctionUrl(inputs);

    expect(String(url)).toBe('https://test.jsfn.run/');
  });

  it('should include input params as search params', () => {
    const inputs: CliInputs = {
      options: {},
      params: { foo: 'foo', bar: true },
      name: 'test',
      inputs: ['action'],
    };

    const url = buildFunctionUrl(inputs);

    expect(String(url)).toBe('https://test.jsfn.run/action?foo=foo&bar=true');
  });

  it('should point to a local server if options.local was set, and include the local port', () => {
    const inputs: CliInputs = {
      options: { local: true, port: '1111' },
      params: { foo: 'foo' },
      name: 'test',
      inputs: ['action'],
    };

    const url = buildFunctionUrl(inputs);

    expect(String(url)).toBe('http://localhost:1111/action?foo=foo');
  });

  it('should throw an error if the function name was not found', () => {
    const inputs: CliInputs = {
      options: {},
      params: {},
      name: '',
      inputs: [],
    };

    expect(() => buildFunctionUrl(inputs)).toThrowError('Function name not provided.');
  });
});
