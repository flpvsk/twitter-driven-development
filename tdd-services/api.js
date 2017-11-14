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
  wss = new ws.Server({port: 8080});
  wss.on('connection', () => {
    console.log('[api] client connected');
  });
};

module.exports = {
  startServer,
  broadcast
};

