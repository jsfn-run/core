export default {
  version: 1,
  input: 'text',
  output: 'text',
  handler: (request, response) => response.send(request.body),
};
