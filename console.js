const ansiCodes = {
  error: '\u001b[33;1m',
  info: '\u001b[34;1m',
  log: '\u001b[37;1m',
  reset: '\u001b[0m',
};

export const Console = {
  write(type, ...values) {
    console.log(ansiCodes[type], ...values, ansiCodes.reset);
  },

  log(...args) {
    Console.write('log', ...args);
  },

  info(...args) {
    Console.write('info', ...args);
  },

  error(...args) {
    Console.write('error', ...args);
  },
};
