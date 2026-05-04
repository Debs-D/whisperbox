function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const SUN_ICON  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isLight = document.documentElement.dataset.theme === 'light';
  btn.innerHTML = isLight ? MOON_ICON : SUN_ICON;
  btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

function toggleTheme() {
  const isLight = document.documentElement.dataset.theme === 'light';
  document.documentElement.dataset.theme = isLight ? '' : 'light';
  localStorage.setItem('wb_theme', isLight ? 'dark' : 'light');
  updateThemeIcon();
}

async function boot() {
  if (!API.isLoggedIn()) {
    UI.showView('auth');
    bindAuthUI();
    return;
  }
  UI.showView('auth');
  bindAuthUI();
}

function bindAuthUI() {
  const $ = UI.$;

  $('login-tab').addEventListener('click', () => {
    $('login-tab').classList.add('active');
    $('register-tab').classList.remove('active');
    $('login-form').classList.remove('hidden');
    $('register-form').classList.add('hidden');
    $('login-error').textContent = '';
    $('register-error').textContent = '';
  });

  $('register-tab').addEventListener('click', () => {
    $('register-tab').classList.add('active');
    $('login-tab').classList.remove('active');
    $('register-form').classList.remove('hidden');
    $('login-form').classList.add('hidden');
    $('login-error').textContent = '';
    $('register-error').textContent = '';
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errEl    = $('login-error');
    const btn      = $('login-btn');

    if (!username || !password) {
      errEl.textContent = 'Please fill in all fields.';
      return;
    }

    UI.btnLoading(btn, true, 'Sign In');
    errEl.textContent = '';

    try {
      UI.setLoading(true, 'Authenticating…');
      const data = await API.login(username, password);

      UI.setLoading(true, 'Unlocking encryption keys…');
      const salt      = Crypto.fromB64(data.user.pbkdf2_salt);
      const wrapped   = data.user.wrapped_private_key;
      const algorithm = Crypto.isLegacyWrapped(wrapped) ? 'AES-GCM' : 'AES-KW';
      const wrapKey   = await Crypto.deriveKey(password, salt, algorithm);
      const privateKey = await Crypto.unwrapPrivateKey(wrapped, wrapKey);
      const publicKey  = await Crypto.importPublicKey(data.user.public_key);

      Store.set('user',       data.user);
      Store.set('privateKey', privateKey);
      Store.set('publicKey',  publicKey);

      UI.setLoading(false);
      await enterApp();
    } catch (err) {
      UI.setLoading(false);
      errEl.textContent = friendlyError(err, 'Incorrect username or password.');
      UI.toast("New here? Switch to 'Create Account' to get started.", 'info', 5000);
    } finally {
      UI.btnLoading(btn, false, 'Sign In');
    }
  });

  $('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username    = $('reg-username').value.trim();
    const displayName = $('reg-displayname').value.trim();
    const password    = $('reg-password').value;
    const confirm     = $('reg-confirm').value;
    const errEl       = $('register-error');
    const btn         = $('register-btn');

    if (!username || !displayName || !password || !confirm) {
      errEl.textContent = 'All fields are required.'; return;
    }
    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match.'; return;
    }
    if (password.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters.'; return;
    }
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      errEl.textContent = 'Username: 3–32 characters, letters/numbers/underscores/hyphens only.'; return;
    }

    UI.btnLoading(btn, true, 'Create Account');
    errEl.textContent = '';

    try {
      UI.setLoading(true, 'Generating your encryption keys…');
      const keyPair = await Crypto.generateKeyPair();
      const salt    = Crypto.generateSalt();

      UI.setLoading(true, 'Securing your private key…');
      const wrapKey        = await Crypto.deriveKey(password, salt);
      const wrappedPrivKey = await Crypto.wrapPrivateKey(keyPair.privateKey, wrapKey);
      const pubKeyB64      = await Crypto.exportPublicKey(keyPair.publicKey);

      UI.setLoading(true, 'Creating your account…');
      const data = await API.register({
        username,
        display_name:        displayName,
        password,
        public_key:          pubKeyB64,
        wrapped_private_key: wrappedPrivKey,
        pbkdf2_salt:         Crypto.toB64(salt),
      });

      Store.set('user',       data.user);
      Store.set('privateKey', keyPair.privateKey);
      Store.set('publicKey',  keyPair.publicKey);

      UI.setLoading(false);
      await enterApp();
    } catch (err) {
      UI.setLoading(false);
      errEl.textContent = friendlyError(err, 'Registration failed — username may already be taken.');
    } finally {
      UI.btnLoading(btn, false, 'Create Account');
    }
  });
}

async function enterApp() {
  const user = Store.get('user');
  const $    = UI.$;

  UI.showView('app');
  UI.stampAvatar($('current-user-avatar'), user.display_name || user.username);
  $('current-user-name').textContent = user.display_name || user.username;

  bindAppUI();
  initSocket();
  await loadConversations();
}

function initSocket() {
  Socket.on('message.receive', handleIncomingMessage);
  Socket.on('user.online',  (data) => handlePresence(data.user_id, true));
  Socket.on('user.offline', (data) => handlePresence(data.user_id, false));
  Socket.connect();
}

async function handleIncomingMessage(data) {
  const myId   = Store.get('user').id;
  const active = Store.get('activeConversation');

  const isSender   = data.from_user_id === myId;
  const chatUserId = isSender ? data.to_user_id : data.from_user_id;

  const existing = Store.getMessages(chatUserId).find((m) => m.id === data.id);
  if (existing) return;

  let decrypted;
  try {
    const plaintext = await Crypto.decryptMessage(data.payload, Store.get('privateKey'), isSender);
    decrypted = { ...data, _decrypted: plaintext };
  } catch {
    decrypted = { ...data, _error: 'Message could not be decrypted' };
  }

  Store.addMessage(chatUserId, decrypted);

  if (active && active.userId === chatUserId) {
    UI.appendMsg(decrypted, myId);
  }

  loadConversations();
}

function handlePresence(userId, online) {
  Store.setOnline(userId, online);
  UI.setUserOnline(userId, online);

  const active = Store.get('activeConversation');
  if (active && active.userId === userId) {
    UI.setPeerStatus(online);
  }
}

function bindAppUI() {
  const $ = UI.$;

  updateThemeIcon();
  $('theme-toggle').addEventListener('click', toggleTheme);

  $('open-profile').addEventListener('click', openProfile);
  $('close-profile').addEventListener('click', closeProfile);
  $('profile-modal').addEventListener('click', (e) => {
    if (e.target === $('profile-modal')) closeProfile();
  });

  $('logout-btn').addEventListener('click', () => {
    $('logout-modal').classList.remove('hidden');
  });

  $('logout-cancel').addEventListener('click', () => {
    $('logout-modal').classList.add('hidden');
  });

  $('logout-modal').addEventListener('click', (e) => {
    if (e.target === $('logout-modal')) $('logout-modal').classList.add('hidden');
  });

  $('logout-confirm').addEventListener('click', async () => {
    $('logout-modal').classList.add('hidden');
    Socket.disconnect();
    try { await API.logout(API.getRefreshToken()); } catch { /* best-effort */ }
    Store.clear();
    location.reload();
  });

  $('new-chat-btn').addEventListener('click', () => {
    $('new-chat-modal').classList.remove('hidden');
    $('modal-search-input').value = '';
    $('modal-search-results').innerHTML = '';
    setTimeout(() => $('modal-search-input').focus(), 50);
  });

  const closeModal = () => {
    $('new-chat-modal').classList.add('hidden');
    $('modal-search-input').value = '';
    $('modal-search-results').innerHTML = '';
  };

  $('close-modal').addEventListener('click', closeModal);
  $('new-chat-modal').addEventListener('click', (e) => {
    if (e.target === $('new-chat-modal')) closeModal();
  });

  $('modal-search-input').addEventListener(
    'input',
    debounce(async (e) => {
      const q = e.target.value.trim();
      const container = $('modal-search-results');
      if (!q) { container.innerHTML = ''; return; }
      container.innerHTML = `<div style="padding:12px 18px;color:var(--text-muted);font-size:13px">Searching…</div>`;
      try {
        const users = await API.searchUsers(q);
        UI.renderSearchHits(users, 'modal-search-results', Store.get('user').id, (uid, name) => {
          closeModal();
          openConversation(uid, name);
        });
      } catch {
        container.innerHTML = `<div style="padding:12px 18px;color:var(--text-muted);font-size:13px">Search failed</div>`;
      }
    }, 300)
  );

  $('search-input').addEventListener(
    'input',
    debounce(async (e) => {
      const q         = e.target.value.trim();
      const container = $('search-results');
      if (!q) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
      }
      container.classList.remove('hidden');
      container.innerHTML = `<div style="padding:10px 14px;color:var(--text-muted);font-size:13px">Searching…</div>`;
      try {
        const users = await API.searchUsers(q);
        UI.renderSearchHits(users, 'search-results', Store.get('user').id, (uid, name) => {
          container.classList.add('hidden');
          container.innerHTML = '';
          $('search-input').value = '';
          openConversation(uid, name);
        });
      } catch {
        container.innerHTML = `<div style="padding:10px 14px;color:var(--text-muted);font-size:13px">Search failed</div>`;
      }
    }, 300)
  );

  const input   = $('message-input');
  const sendBtn = $('send-btn');

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);
}

async function loadConversations() {
  try {
    const convs = await API.getConversations();
    Store.set('conversations', convs || []);
    UI.renderConversations(convs || [], openConversation);

    const active = Store.get('activeConversation');
    if (active) UI.setActiveConv(active.userId);

    Store.getOnlineUsers().forEach((uid) => UI.setUserOnline(uid, true));
  } catch {
    UI.toast('Could not load conversations', 'error');
  }
}

async function openConversation(userId, displayName) {
  const $ = UI.$;

  Store.set('activeConversation', { userId, displayName });
  UI.setActiveConv(userId);

  $('empty-state').classList.add('hidden');
  $('chat-view').classList.remove('hidden');

  $('chat-peer-name').textContent = displayName;
  UI.stampAvatar($('chat-peer-avatar'), displayName);
  UI.setPeerStatus(Store.isOnline(userId));

  $('messages-list').innerHTML = `
    <div class="msgs-loading">
      <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>`;

  const input = $('message-input');
  input.value = '';
  input.style.height = 'auto';
  $('send-btn').disabled = true;

  try {
    const raw  = await API.getMessages(userId);
    const ordered = (raw || []).reverse();
    const msgs = await decryptAll(ordered, userId);
    Store.setMessages(userId, msgs);
    UI.renderMessages(msgs, Store.get('user').id);
    UI.scrollBottom();
  } catch {
    $('messages-list').innerHTML = `
      <div style="text-align:center;color:var(--red);padding:30px;font-size:13px">
        Failed to load messages
      </div>`;
  }

  input.focus();
  loadConversations();
}

async function decryptAll(messages, _otherUserId) {
  const privateKey = Store.get('privateKey');
  const myId       = Store.get('user').id;
  const results    = [];

  for (const msg of messages) {
    const isSender = msg.from_user_id === myId;
    try {
      const plaintext = await Crypto.decryptMessage(msg.payload, privateKey, isSender);
      results.push({ ...msg, _decrypted: plaintext });
    } catch {
      results.push({ ...msg, _error: 'Message could not be decrypted' });
    }
  }
  return results;
}

async function handleSend() {
  const $       = UI.$;
  const input   = $('message-input');
  const sendBtn = $('send-btn');
  const text    = input.value.trim();
  if (!text) return;

  const active = Store.get('activeConversation');
  if (!active) return;

  const { userId } = active;
  const myId = Store.get('user').id;

  input.value        = '';
  input.style.height = 'auto';
  sendBtn.disabled   = true;

  try {
    let recipientPubKey = Store.getPeerKey(userId);
    if (!recipientPubKey) {
      const keyData   = await API.getUserPublicKey(userId);
      recipientPubKey = await Crypto.importPublicKey(keyData.public_key);
      Store.cachePeerKey(userId, recipientPubKey);
    }

    const senderPubKey = Store.get('publicKey');
    const payload      = await Crypto.encryptMessage(text, recipientPubKey, senderPubKey);

    if (Socket.send(userId, payload)) {
      const sent = {
        id:           'local-' + Date.now(),
        from_user_id: myId,
        to_user_id:   userId,
        payload,
        delivered:    false,
        created_at:   new Date().toISOString(),
        _decrypted:   text,
      };
      Store.addMessage(userId, sent);
      UI.appendMsg(sent, myId);
    } else {
      const msg  = await API.sendMessage(userId, payload);
      const sent = { ...msg, _decrypted: text };
      Store.addMessage(userId, sent);
      UI.appendMsg(sent, myId);
    }

    loadConversations();
  } catch (err) {
    UI.toast('Failed to send: ' + friendlyError(err), 'error');
    input.value = text;
    sendBtn.disabled = false;
  }
}

function openProfile() {
  const user = Store.get('user');
  if (!user) return;

  const $ = UI.$;
  UI.stampAvatar($('profile-avatar'), user.display_name || user.username);
  $('profile-display-name').textContent = user.display_name || user.username;
  $('profile-username-label').textContent = '@' + user.username;

  if (user.created_at) {
    $('profile-joined').textContent = new Date(user.created_at).toLocaleDateString([], {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  $('profile-modal').classList.remove('hidden');
}

function closeProfile() {
  document.getElementById('profile-modal').classList.add('hidden');
}

function friendlyError(err, fallback) {
  const msg = err?.message || '';
  if (msg.length > 0 && msg.length < 120) return msg;
  return fallback || 'Something went wrong — please try again.';
}

boot();
