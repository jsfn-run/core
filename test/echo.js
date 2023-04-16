import { Format } from '../dist/index.js';

const config = {
  version: 1,
  input: Format.Text,
  output: Format.Text,
  handler: (request, response) => response.send(request.body),
};

export default config;
