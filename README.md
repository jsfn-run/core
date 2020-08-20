# @node-lambdas/core

The code behind all node-lambdas

## Input/Output

A lambda handler function will receive two arguments, `input` and `output`, which are just Node.js [request](https://nodejs.org/api/http.html#http_class_http_incomingmessage) and [response](https://nodejs.org/api/http.html#http_class_http_serverresponse) objects from an incoming request.

They have a few extra properties:

#### `request.body`

| input type    | request.body |
| ------------- | ------------ |
| Format.Text   | string       |
| Format.Json   | object       |
| Format.Buffer | Buffer       |
| - not set -   | undefined    |

#### response output (via output.send(response))

| output type   | response body |
| ------------- | ------------- |
| Format.Text   | string        |
| Format.Json   | JSON string   |
| Format.Buffer | binary output |
| - not set -   | binary output |

In `v1` only one input/output format can be specified for the entire server
In `v2`, each action can specify a different input/input/output format.

#### `request.options`

In `v2`, options are parsed from the query string parameters sent by the incoming HTTP request.

For example, consider a call to function `foo` with `POST /action?alice=1&bob=2`. Then `request.options` will be an object like `{ alice: 1, bob: 2 }`

#### `request.url`

In `v1` is just a string.
In `v2`, instead of a string, this is set to an instance of [URL](https://nodejs.org/api/url.html#url_the_whatwg_url_api) parsed from the incoming request URL.

---

## Configuration object

### v1

Accepts a configuration object and a simple handler function.

```javascript
import { lambda, Format } from '@node-lambdas/core';

const configuration = {
  version: 1,
  input: Format.Text,
  output: Format.Json,
};

function main(input, output) {
  const textInput = input.body;
  const jsonOutput = { text: textInput };

  output.send(jsonOutput);
}

lambda(configuration, main);
```

### v2

Accepts multiple actions in a single lambda.
One of the actions can be marked as default.

```javascript
import { lambda, Format } from '@node-lambdas/core';

// some format that can be transformed into JSON and back into text
function encode(text) {}
function decode(json) {}

const configuration = {
  version: 2,
  actions: {
    encode: {
      default: true,
      input: Format.Text,
      output: Format.Json,
      handler: (input, output) => output.send(encode(input.body)),
    },

    decode: {
      input: Format.Json,
      output: Format.Text,
      handler: (input, output) => output.send(decode(input.body)),
    },
  },
};

lambda(configuration, main);
```

## Version history

`v1`

First version. Just process input and send back an output.

`v2`

Add support for multiple actions and different input/output formats per action.
Parses the incoming URL and adds `request.options`
