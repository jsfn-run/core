import { parseOptionsAndParams } from './options';

describe('read options from an array of strings', () => {
  it('should read boolean inputs', () => {
    // fn +option name +local --param --foo=1 foo
    const input = ['+option', 'name', '+info', '+local', '--param', '--foo=1', 'foo'];
    const expected = {
      name: 'foo',
      inputs: [],
      options: { option: 'name', local: true, info: true, nodata: false },
      params: { param: true, foo: '1' },
    };

    expect(parseOptionsAndParams(input)).toEqual(expected);
  });

  it('should read a file reference as input', () => {
    // fn @file.txt run
    const input = ['@file.txt', 'run'];
    const expected = {
      name: 'run',
      inputs: [],
      options: { stdin: 'file.txt', nodata: false },
      params: {},
    };

    expect(parseOptionsAndParams(input)).toEqual(expected);
  });

  it('should read function parameters and options in separated objects', () => {
    // fn +debug +port=123 +stdin file.txt skip-me --key=value --flag --name bob something else
    const input = [
      'skip-me',
      '+debug',
      '+port=123',
      '+stdin',
      'file.txt',
      '--key=value',
      '--flag',
      '--name',
      'bob',
      'something',
      'else',
    ];
    const expected = {
      name: 'skip-me',
      inputs: ['something', 'else'],
      options: {
        debug: true,
        nodata: false,
        port: '123',
        stdin: 'file.txt',
      },
      params: {
        key: 'value',
        flag: true,
        name: 'bob',
      },
    };

    expect(parseOptionsAndParams(input)).toEqual(expected);
  });
});