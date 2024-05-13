# Node Lambdas Client

Node.js interface to use with [jsfn.run](https://jsfn.run) API.

## Usage

Here's an example on how to convert between JSON to YAML and then base64 using a web function:

```js
// JSON > YAML > base64

const json = JSON.stringify({ hello: 'world' });
const encode = pipe({ name: 'yaml', action: 'encode' }, { name: 'base64', action: 'encode' });
const response = await encode(json);

console.log(await response.text());
```
