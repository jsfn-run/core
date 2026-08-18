# @node-lambdas/core

The main code behind all "function-as-a-service" utilities at [jsfn.run](https://jsfn.run).

## Introduction

Node Lambdas are tiny HTTP servers that receive an input request and generate an output. Each function has its own web address and works like a regular server.

The main motivation is to make it dead-easy to spin up new services that expose any NPM module or API under the hood.

Do you need to convert an image? Parse a YAML? Validate a JSON?
Instead of installing something, just post it to a Node Lambda!

## Functions API

A node-lambda is a single `.mjs` file that exports a configuration object.

A function handler receives two arguments, `input` and `output`.

They are the same instances of a normal Node.JS HTTP server, with some additional properties:

```ts
interface Request extends IncomingMessage {
  credentials: Record<string, string>;
  options: Record<string, string>;
  asText(): Promise<string>;
  asJson(): Promise<any>;
  asBuffer(): Promise<Buffer>;
}

interface Response extends ServerResponse {
  request: Request;
  header(name: string, value: string): void;
  reject(message: string): void;
  sendText(b: string): void;
  sendJson(b: any): void;
  sendBuffer(b: Buffer): void;
  pipeTo(nextCommand: string, args: string[]): void;
  send(body: any): void;
  send(status: number, body: any): void;
}
```

## Examples

The simplest function just prints its input back to the output:

```ts
// index.mjs
export default function sendInputBack(input, output) {
  input.pipe(output);
}
```

A more useful example: create a hash from the input text

```ts
import { createHash } from 'node:crypto';

export default {
  version: 2,
  description: 'Create a hash from the input. Set the "type" option to any Node.js hash algorithm, like sha256',
  actions: {
    createHash: {
      default: true,
      options: {
        type: 'algorithm',
      },
      handler(input, output) {
        const type = input.options.type || 'sha256';
        const hash = createHash(type);
        input.on('data', (c) => hash.update(c));
        input.on('end', () => output.sendText(hash.digest('hex')));
      },
    },
  },
};
```

## Function Configurations

To allow multiple actions in a single cloud function, and allow for options, the API prefers
an object as a default export. For example:

```js
// index.mjs

export default {
  actions: {
    echo: {
      default: true,
      handler(input, output) {
        input.pipe(output);
      },
    },
  },
};
```

This function is invoked calling `POST https://echo.jsfn.run/` with any content.
The data is just sent back as a stream.

## Input/Output

A lambda handler function will receive two arguments, `input` and `output`, which are just Node.js [request](https://nodejs.org/api/http.html#http_class_http_incomingmessage) and [response](https://nodejs.org/api/http.html#http_class_http_serverresponse) objects from an incoming request.

They have a few extra properties:

#### `request.body`

| input type  | request.body |
| ----------- | ------------ |
| text        | string       |
| json        | object       |
| buffer      | Buffer       |
| - not set - | undefined    |

If not set, the request data won't be read from stream.
Use `request.on('data')` and `request.on('end')` to read the input in the action.

#### response output (via output.send(response))

| output type | response body |
| ----------- | ------------- |
| text        | string        |
| json        | JSON string   |
| buffer      | binary output |
| - not set - | binary output |

In `v1` only one input/output format can be specified
In `v2`, each action can specify a different input/input/output format.

#### `request.options`

In `v2`, options are parsed from the query string parameters sent by the incoming HTTP request.

For example, consider a call to function `foo` with `POST /action?alice=1&bob=2`. Then `request.options` will be an object like `{ alice: 1, bob: 2 }`

#### `request.parsedUrl`

Since `v2`.
This is set to an instance of [URL](https://nodejs.org/api/url.html#url_the_whatwg_url_api) parsed from `request.url`.

---

## Configuration object

### v1

Accepts a configuration object and a simple handler function.

```javascript
function textToJson(input, output) {
  const textInput = input.body;
  const jsonOutput = { text: textInput };

  output.sendJson(jsonOutput);
}

export default {
  version: 1,
  input: 'text',
  output: 'json',
  handler: main,
};
```

### v2

Accepts multiple actions in a single lambda.
One of the actions can be marked as default.

```javascript
import { lambda, Format } from '@node-lambdas/core';

// encode text as JSON
function encode(text) {
  return { text };
}

// decode JSON back to text
function decode(json) {
  return json.text;
}

const configuration = {
  version: 2,
  description: '',
  actions: {
    encode: {
      default: true,
      input: 'text',
      output: 'json',
      handler: (input, output) => output.send(encode(input.body)),
    },

    decode: {
      input: 'json',
      output: 'text',
      handler: (input, output) => output.send(decode(input.body)),
    },
  },
};

export default configuration;
```

## Version history

`v1`

First version. Just process input and send back an output.

`v2`

- Add support for multiple actions and different input/output formats per action.
- Parses the incoming URL
- adds `request.options` and `request.credentials`

# Docker runner

Node.js runner for cloud functions

## Environment

| name        | type   | description                                       |
| ----------- | ------ | ------------------------------------------------- |
| PORT        | number | HTTP port                                         |
| WORKING_DIR | string | Default: `/home/fn`                               |
| REPOSITORY  | string | Run from a GH repository, e.g. `org/octocat:main` |
| SOURCE_URL  | string | URL of a zip or tgz file to download and run      |

## Usage

With docker, run `ghcr.io/jsfn-run/runner:latest` with either `SOURCE_URL` or `REPOSITORY` set.

Example:

```sh
# Using a function from GitHub source, e.g. my-org/yaml
docker run --rm -it -e -p3000:3000 REPOSITORY=my-org/yaml ghcr.io/my-org/runner:latest

# Using an URL with a tar or zip file
docker run --rm -it -e -p3000:3000 SOURCE_URL=https://example.com/fn.zip ghcr.io/jsfn-run/runner:latest

# Using a function in a local folder
docker run --rm -it -e -p3000:3000 -v $PWD:/home/fn ghcr.io/jsfn-run/runner:latest
```

## Using as a base image in Docker

The runner can also host multiple functions in a single image. Here's how:

- Create a folder called `functions` and new sub-folders for every function you want to serve
- Add `index.mjs` or `index.js` in a folder to export the function configuration
- Optionally, add a `package.json` in that folder if there are dependencies.
  To keep dependencies in sync and locked, you can also add `package.json` at the root level, and
  add all function sub-folders a workspace.
- On the root folder level, create a `Dockerfile`.

  Example:

  ```text
  |  Dockerfile
  |  functions/
  |    foo/
  |      index.js
  |    bar/
  |      index.js
  |      package.json
  ```

- Use the following steps:

  ```dockerfile
  FROM ghcr.io/jsfn-run/runner
  ENV MULTIPLEXED=true

  COPY --chown=1000:1000 . /home/fn
  # Recommended if the "workspaces" option was used in package.json
  RUN cd /home/fn && npm install --omit=dev
  ```

- Build your Docker image and run it like a regular HTTP server

  ```sh
  docker build -t runner .
  ```

- Run the container

  ```sh
  docker run -d -e PORT=1234 runner
  curl -X POST -H 'X-Lambda: foo' http://localhost:1234/foo --data-raw 'send this to foo function'
  ```

### Environment variables:

| name        | type    | description                                                                                 |
| ----------- | ------- | ------------------------------------------------------------------------------------------- |
| PORT        | number  | HTTP port                                                                                   |
| MULTIPLEXED | boolean | Set to `true`                                                                               |
| BASE_DOMAIN | string  | Defines the top-level domain for function name resolution from host. Default is `.jsfn.run` |

> Note: If `BASE_DOMAIN` is set, then multiple subdomains are used for a single server and every function is mapped to a subdomain.
> For example, `foo.jsfn.run` is mapped to a call to `foo` in the multiplexed server.
