const API = (() => {
  const BASE = 'https://whisperbox.koyeb.app';

  const get = (k) => sessionStorage.getItem(k);
  const set = (k, v) => sessionStorage.setItem(k, v);

  function saveTokens(access, refresh, expiresIn) {
    set('wb_access',  access);
    set('wb_refresh', refresh);
    set('wb_exp',     Date.now() + expiresIn * 1000);
  }

  async function _silentRefresh() {
    const rt = get('wb_refresh');
    if (!rt) throw new Error('No refresh token — please log in again.');

    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) throw new Error('Session expired.');

    const data = await res.json();
    set('wb_access', data.access_token);
    set('wb_exp',    Date.now() + data.expires_in * 1000);
  }

  async function req(path, opts = {}, _retry = true) {
    const token = get('wb_access');
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...opts, headers });

    if (res.status === 401 && _retry && get('wb_refresh')) {
      try {
        await _silentRefresh();
        return req(path, opts, false);
      } catch {
        sessionStorage.clear();
        location.reload();
      }
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body.detail || JSON.stringify(body);
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  return {
    isLoggedIn() {
      return !!get('wb_access');
    },

    getRefreshToken() {
      return get('wb_refresh');
    },

    getAccessToken() {
      return get('wb_access');
    },

    getExpiresIn() {
      const exp = parseInt(get('wb_exp')) || 0;
      return Math.max(0, Math.floor((exp - Date.now()) / 1000));
    },

    silentRefresh: _silentRefresh,

    async register(payload) {
      const data = await req('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      saveTokens(data.access_token, data.refresh_token, data.expires_in);
      return data;
    },

    async login(username, password) {
      const data = await req('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      saveTokens(data.access_token, data.refresh_token, data.expires_in);
      return data;
    },

    async logout(refreshToken) {
      await req('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
      sessionStorage.clear();
    },

    me() {
      return req('/auth/me');
    },

    searchUsers(q) {
      return req(`/users/search?q=${encodeURIComponent(q)}`);
    },

    getUserPublicKey(userId) {
      return req(`/users/${userId}/public-key`);
    },

    getConversations() {
      return req('/conversations');
    },

    getMessages(userId, limit = 50, before = null) {
      let url = `/conversations/${userId}/messages?limit=${limit}`;
      if (before) url += `&before=${encodeURIComponent(before)}`;
      return req(url);
    },

    sendMessage(to, payload) {
      return req('/messages', {
        method: 'POST',
        body: JSON.stringify({ to, payload }),
      });
    },
  };
})();
