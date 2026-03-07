const { onRequest } = require('firebase-functions/v2/https');
  const server = import('firebase-frameworks');
  exports.ssracademywebsite7a3e1 = onRequest({}, (req, res) => server.then(it => it.handle(req, res)));
  