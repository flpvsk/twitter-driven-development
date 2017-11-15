const ws = require('ws');

let wss;

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === ws.OPEN) {
      client.send(data);
    }
  });
};


const startServer = () => {
  wss = new ws.Server({port: process.env.WEB_SOCKET_PORT});
  wss.on('connection', () => {
    console.log('[api] client connected');
  });
};

module.exports = {
  startServer,
  broadcast
};

