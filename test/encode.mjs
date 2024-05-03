/* @type {import('@node-lambdas/core').Configuration} */

export default {
  actions: {
    encode: {
      default: true,
      input: 'text',
      output: 'text',
      handler(input, output) {
        output.send('code: ' + input.body);
      },
    },

    decode: {
      input: 'text',
      output: 'text',
      handler(input, output) {
        output.send('decode: ' + input.body);
      },
    },
  },
};
