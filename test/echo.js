import { Format } from '../dist/index.js';

const config = {
  version: 1,
  input: 'text',
  output: 'text',
  handler: (request, response) => response.send(request.body),
};

export default config;
