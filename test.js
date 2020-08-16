import { lambda, Format } from './index.js';

lambda({ input: Format.Text }, (input, output) => output.send(input.body));