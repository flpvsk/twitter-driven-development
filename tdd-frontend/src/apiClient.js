const HOST_URL = process.env.REACT_APP_HOST_URL;

const createSocket = (cb) => {
  let ws = new WebSocket(HOST_URL);

  ws.addEventListener('close', () => {

  });

  ws.addEventListener('message', (msg) => {
    cb(JSON.parse(msg.data));
  });
};

const subscribe = (cb) => {
  createSocket(cb);
};

export {
  subscribe
};
