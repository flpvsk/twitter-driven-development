const HOST_URL = process.env.REACT_APP_HOST_URL;
const RETRY_INTERVALS = [100, 500, 1000, 1500, 2000, 4000, 8000];


function createWebSocket(cb) {
  let ws;
  let retry = true;
  let retryIntervalId = 0;
  let listener = (msg) => {
    const data = JSON.parse(msg.data);
    console.log(
      '[apiClient]',
      'Received',
      data
    );

    cb(data);
  };


  function openWebSocket() {
    console.log(
      '[apiClient]',
      'Opening web socket'
    );

    ws = new WebSocket(HOST_URL);

    ws.addEventListener('open', () => {
      console.log('[apiClient]', 'Web socket opened');
      retryIntervalId = 0;
      ws.addEventListener('message', listener);
    });


    ws.addEventListener('close', () => {
      const interval = RETRY_INTERVALS[retryIntervalId];

      console.log(
        '[apiClient]',
        `Web socket closed, ` +
        `will try to reconnect in ` +
        `${interval}ms`
      );

      ws = undefined;

      if (!retry) {
        return;
      }

      setTimeout(openWebSocket, interval);

      // choosing next retry interval
      retryIntervalId = Math.min(
        retryIntervalId + 1,
        RETRY_INTERVALS.length - 1
      );
    });
  }


  openWebSocket();
}


const subscribe = (cb) => {
  createWebSocket(cb);
};

export { subscribe };
