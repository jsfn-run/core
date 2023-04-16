import { Format } from '../dist/index.js';

export default {
  version: 2,
  actions: {
    encode: {
      default: true,
      input: Format.Text,
      output: Format.Text,
      handler(input, output) {
        output.send('code: ' + input.body);
      },
    },

    decode: {
      input: Format.Text,
      output: Format.Text,
      handler(input, output) {
        output.send('decode: ' + input.body);
      },
    },
  },
};
