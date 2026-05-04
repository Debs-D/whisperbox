const Socket = (() => {
  const WS_URL = 'wss://whisperbox.koyeb.app/ws';

  let _ws = null;
  let _refreshTimer = null;
  let _handlers = {};

  function _scheduleRefresh(expiresInSec) {
    clearTimeout(_refreshTimer);
    const delay = Math.max((expiresInSec - 60) * 1000, 30_000);
    _refreshTimer = setTimeout(_proactiveRefresh, delay);
  }

  async function _proactiveRefresh() {
    try {
      await API.silentRefresh();
      _reconnect();
    } catch {
      sessionStorage.clear();
      location.reload();
    }
  }

  function _reconnect() {
    if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
    connect();
  }

  function connect() {
    const token = API.getAccessToken();
    if (!token) return;

    if (_ws && _ws.readyState === WebSocket.OPEN) return;

    _ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    _ws.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      const handler = _handlers[data.event];
      if (handler) handler(data);
    };

    _ws.onclose = async (e) => {
      clearTimeout(_refreshTimer);
      _ws = null;

      if (e.code === 4001) {
        try {
          await API.silentRefresh();
          connect();
        } catch {
          sessionStorage.clear();
          location.reload();
        }
      } else if (e.code === 4003) {
        sessionStorage.clear();
        location.reload();
      }
    };

    _ws.onerror = () => {};

    _scheduleRefresh(API.getExpiresIn());
  }

  function send(to, payload) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ event: 'message.send', to, payload }));
      return true;
    }
    return false;
  }

  function on(event, cb) {
    _handlers[event] = cb;
  }

  function disconnect() {
    clearTimeout(_refreshTimer);
    if (_ws) { _ws.onclose = null; _ws.close(); _ws = null; }
    _handlers = {};
  }

  function isConnected() {
    return !!(_ws && _ws.readyState === WebSocket.OPEN);
  }

  return { connect, send, on, disconnect, isConnected };
})();
