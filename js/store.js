const Store = (() => {
  let _state = {
    user:               null,
    privateKey:         null,
    publicKey:          null,
    conversations:      [],
    activeConversation: null,
    messages:           {},
    peerPublicKeys:     {},
    onlineUsers:        new Set(),
  };

  return {
    get(key)        { return _state[key]; },
    set(key, value) { _state[key] = value; },

    getMessages(uid)       { return _state.messages[uid] || []; },
    setMessages(uid, msgs) { _state.messages[uid] = msgs; },
    addMessage(uid, msg) {
      if (!_state.messages[uid]) _state.messages[uid] = [];
      _state.messages[uid].push(msg);
    },

    getPeerKey(uid)              { return _state.peerPublicKeys[uid] || null; },
    cachePeerKey(uid, cryptoKey) { _state.peerPublicKeys[uid] = cryptoKey; },

    isOnline(uid)          { return _state.onlineUsers.has(uid); },
    setOnline(uid, online) {
      if (online) _state.onlineUsers.add(uid);
      else _state.onlineUsers.delete(uid);
    },
    getOnlineUsers() { return _state.onlineUsers; },

    clear() {
      _state = {
        user: null, privateKey: null, publicKey: null,
        conversations: [], activeConversation: null,
        messages: {}, peerPublicKeys: {}, onlineUsers: new Set(),
      };
    },
  };
})();
