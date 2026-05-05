const UI = (() => {
  const $ = (id) => document.getElementById(id);

  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $(`${name}-view`).classList.remove('hidden');
  }

  function setLoading(visible, message = 'Loading…') {
    $('loading-overlay').classList.toggle('hidden', !visible);
    if (visible) $('loading-message').textContent = message;
  }

  function toast(message, type = 'info', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  const COLORS = [
    '#5b21b6','#6d28d9','#4338ca','#1d4ed8',
    '#0369a1','#047857','#b45309','#9f1239',
  ];

  function colorFor(name) {
    let h = 0;
    for (const ch of (name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function stampAvatar(el, name) {
    el.textContent      = initials(name);
    el.style.background = colorFor(name);
  }

  function fmtTime(iso) {
    const d   = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function fmtDate(iso) {
    const d   = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function btnLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.querySelector('span').textContent = loading ? '…' : label;
  }

  function renderConversations(convs, onSelect) {
    const list = $('conversations-list');
    if (!convs || convs.length === 0) {
      list.innerHTML = `
        <div class="no-convs">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
          <span>No conversations yet</span>
          <span>Search someone to start chatting</span>
        </div>`;
      return;
    }

    list.innerHTML = convs.map((c) => `
      <div class="conv-item" data-uid="${esc(c.user_id)}" data-name="${esc(c.display_name)}">
        <div class="avatar-wrap">
          <div class="avatar" data-name="${esc(c.display_name)}"></div>
          <span class="online-dot hidden" data-uid="${esc(c.user_id)}"></span>
        </div>
        <div class="conv-body">
          <div class="conv-name">${esc(c.display_name)}</div>
          <div class="conv-preview enc">Encrypted</div>
        </div>
        <div class="conv-time">${c.last_message_at ? fmtTime(c.last_message_at) : ''}</div>
      </div>`).join('');

    list.querySelectorAll('.avatar[data-name]').forEach((el) => stampAvatar(el, el.dataset.name));

    list.querySelectorAll('.conv-item').forEach((el) => {
      el.addEventListener('click', () => onSelect(el.dataset.uid, el.dataset.name));
    });
  }

  function setActiveConv(uid) {
    document.querySelectorAll('.conv-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.uid === uid);
    });
  }

  function setUserOnline(uid, online) {
    document.querySelectorAll(`.online-dot[data-uid="${CSS.escape(uid)}"]`).forEach((el) => {
      el.classList.toggle('hidden', !online);
    });
  }

  function setPeerStatus(online) {
    const el = $('peer-online-status');
    if (!el) return;
    el.classList.toggle('hidden', !online);
  }

  function renderMessages(msgs, myId) {
    const list = $('messages-list');
    if (!msgs || msgs.length === 0) {
      list.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:40px 0">No messages yet — say hello!</div>`;
      return;
    }

    let lastDate = null;
    let html = '';

    for (const msg of msgs) {
      const dateLabel = fmtDate(msg.created_at);
      if (dateLabel !== lastDate) {
        html += `<div class="date-sep"><span>${dateLabel}</span></div>`;
        lastDate = dateLabel;
      }
      html += msgHTML(msg, myId);
    }

    list.innerHTML = html;
  }

  function msgHTML(msg, myId) {
    const out  = msg.from_user_id === myId;
    const dir  = out ? 'out' : 'in';
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let bubble;
    let hasError = false;

    if (msg._decrypted !== undefined) {
      if (msg._decrypted.startsWith('IMG::')) {
        const src = esc(msg._decrypted.slice(5));
        bubble = `<div class="bubble img-bubble"><img class="msg-image" src="${src}" alt="image" loading="lazy"></div>`;
      } else {
        bubble = `<div class="bubble">${esc(msg._decrypted)}</div>`;
      }
    } else if (msg._error) {
      bubble = `<div class="bubble decrypt-err">⚠ ${esc(msg._error)}</div>`;
      hasError = true;
    } else {
      bubble = `<div class="bubble"><em style="opacity:.5">Decrypting…</em></div>`;
    }

    return `
      <div class="msg-row ${dir}" data-id="${esc(msg.id)}">
        ${bubble}
        <div class="msg-meta">
          <span class="msg-time">${time}</span>
          ${!hasError ? '<span class="lock-tick">🔒</span>' : ''}
        </div>
      </div>`;
  }

  function appendMsg(msg, myId) {
    const list = $('messages-list');
    const placeholder = list.querySelector('div[style*="padding:40px"]');
    if (placeholder) placeholder.remove();

    const el = document.createElement('div');
    el.innerHTML = msgHTML(msg, myId);
    const row = el.firstElementChild;
    list.appendChild(row);
    scrollBottom();
  }

  function scrollBottom() {
    const el = $('messages-scroll');
    el.scrollTop = el.scrollHeight;
  }

  function renderSearchHits(users, containerId, myId, onSelect) {
    const container = $(containerId);
    const filtered  = (users || []).filter((u) => u.id !== myId);

    if (!filtered.length) {
      container.innerHTML = `<div style="padding:12px 18px;color:var(--text-muted);font-size:13px">No users found</div>`;
      return;
    }

    const isModal = containerId === 'modal-search-results';
    const cls     = isModal ? 'modal-user-item' : 'search-hit';

    container.innerHTML = filtered.map((u) => `
      <div class="${cls}" data-uid="${esc(u.id)}" data-name="${esc(u.display_name || u.username)}">
        <div class="avatar-wrap">
          <div class="avatar" data-name="${esc(u.display_name || u.username)}"></div>
          <span class="online-dot hidden" data-uid="${esc(u.id)}"></span>
        </div>
        <div>
          <div class="hit-name">${esc(u.display_name || u.username)}</div>
          <div class="hit-username">@${esc(u.username)}</div>
        </div>
      </div>`).join('');

    container.querySelectorAll('.avatar[data-name]').forEach((el) => stampAvatar(el, el.dataset.name));
    container.querySelectorAll('[data-uid]').forEach((el) => {
      el.addEventListener('click', () => onSelect(el.dataset.uid, el.dataset.name));
    });
  }

  return {
    $,
    showView,
    setLoading,
    toast,
    stampAvatar,
    fmtTime,
    fmtDate,
    esc,
    btnLoading,
    renderConversations,
    setActiveConv,
    setUserOnline,
    setPeerStatus,
    renderMessages,
    appendMsg,
    scrollBottom,
    renderSearchHits,
  };
})();
