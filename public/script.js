// public/script.js
const socket = io();

// ---------- 共通変数 ----------
window.currentRoomId = null;
let selectedImageUrl = null;

// ===== カスタムモーダル（アラート・確認・プロンプト） =====
function showAlert(message) {
  return new Promise((resolve) => {
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('alertBox').style.display = 'flex';
    document.getElementById('alertOkBtn').onclick = () => {
      document.getElementById('alertBox').style.display = 'none';
      resolve();
    };
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmBox').style.display = 'flex';
    document.getElementById('confirmYesBtn').onclick = () => {
      document.getElementById('confirmBox').style.display = 'none';
      resolve(true);
    };
    document.getElementById('confirmNoBtn').onclick = () => {
      document.getElementById('confirmBox').style.display = 'none';
      resolve(false);
    };
  });
}

function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    document.getElementById('promptMessage').textContent = message;
    document.getElementById('promptInput').value = defaultValue;
    document.getElementById('promptBox').style.display = 'flex';
    document.getElementById('promptOkBtn').onclick = () => {
      const val = document.getElementById('promptInput').value;
      document.getElementById('promptBox').style.display = 'none';
      resolve(val);
    };
    document.getElementById('promptCancelBtn').onclick = () => {
      document.getElementById('promptBox').style.display = 'none';
      resolve(null);
    };
  });
}

// ルーム作成モーダル
function showRoomCreateModal() {
  return new Promise((resolve) => {
    document.getElementById('roomNameInput').value = '';
    document.getElementById('roomPasswordInput').value = '';
    document.getElementById('roomCreateBox').style.display = 'flex';
    document.getElementById('roomCreateOkBtn').onclick = () => {
      const name = document.getElementById('roomNameInput').value.trim();
      const password = document.getElementById('roomPasswordInput').value.trim() || null;
      document.getElementById('roomCreateBox').style.display = 'none';
      resolve({ name, password });
    };
    document.getElementById('roomCreateCancelBtn').onclick = () => {
      document.getElementById('roomCreateBox').style.display = 'none';
      resolve(null);
    };
  });
}

// ルーム参加モーダル（コード＋パスワード）
function showRoomJoinModal() {
  return new Promise((resolve) => {
    document.getElementById('roomCodeInput').value = '';
    document.getElementById('roomPasswordInputJoin').value = '';
    document.getElementById('roomJoinBox').style.display = 'flex';
    document.getElementById('roomJoinOkBtn').onclick = () => {
      const code = document.getElementById('roomCodeInput').value.trim();
      const password = document.getElementById('roomPasswordInputJoin').value.trim() || null;
      document.getElementById('roomJoinBox').style.display = 'none';
      resolve({ code, password });
    };
    document.getElementById('roomJoinCancelBtn').onclick = () => {
      document.getElementById('roomJoinBox').style.display = 'none';
      resolve(null);
    };
  });
}

// ===== ユーティリティ =====
function getUserUUID() {
  let uuid = localStorage.getItem('userUUID');
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem('userUUID', uuid);
  }
  return uuid;
}

function saveJoinedRoom(roomId) {
  const key = 'joinedRooms';
  const rooms = JSON.parse(localStorage.getItem(key) || '[]');
  const id = String(roomId);
  if (!rooms.includes(id)) {
    rooms.push(id);
    localStorage.setItem(key, JSON.stringify(rooms));
  }
}

// ===== ルーム一覧読み込み =====
async function loadRooms() {
  const res = await fetch('/rooms');
  const rooms = await res.json();
  const joined = JSON.parse(localStorage.getItem('joinedRooms') || '[]');
  const ul = document.getElementById('roomList');
  ul.innerHTML = '';
  rooms
    .filter(r => joined.includes(String(r.id)))
    .forEach(r => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.textContent = r.name + (r.password ? ' 🔒' : '') + ' (' + r.id + ')';
      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '8px';
      const time = document.createElement('div');
      time.style.fontSize = '12px';
      time.style.color = '#666';
      time.textContent = new Date(r.created_at).toLocaleString();
      const menuBtn = document.createElement('div');
      menuBtn.textContent = '︙';
      menuBtn.style.cursor = 'pointer';
      menuBtn.style.fontSize = '18px';
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        openRoomSettings(r);
      };
      right.appendChild(time);
      right.appendChild(menuBtn);
      li.appendChild(left);
      li.appendChild(right);
      li.onclick = () => openRoom(r.id);
      ul.appendChild(li);
    });
}

// ===== ルームを開く（パスワード省略） =====
async function openRoom(roomId) {
  const joined = JSON.parse(localStorage.getItem('joinedRooms') || '[]');
  if (!joined.includes(String(roomId))) {
    return showAlert('先にルームに参加してください。');
  }

  const res = await fetch('/rooms');
  const rooms = await res.json();
  const room = rooms.find(r => Number(r.id) === Number(roomId));
  if (!room) return showAlert('ルームが見つかりません');

  // パスワードが設定されていて、かつ参加済み（joinedRoomsに入っている）場合は入力不要
  // ※ joinRoomFlow でパスワードチェック済み

  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display = 'block';
  document.getElementById('roomTitle').textContent = room.name;
  document.getElementById('roomInfo').textContent = '作成者: ' + (room.creator || '-');
  window.currentRoomId = String(room.id);
  socket.emit('joinRoom', String(room.id));
  await loadChat(room.id);
}

// ===== チャット =====
async function loadChat(roomId) {
  const res = await fetch('/rooms/' + roomId + '/messages');
  const messages = await res.json();
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML = '';
  messages.forEach(m => appendMessage(m.author, m.text, m.time, m.image));
  chatArea.scrollTop = chatArea.scrollHeight;
}

function appendMessage(author, text, time, image) {
  const chatArea = document.getElementById('chatArea');
  const name = localStorage.getItem('userName') || '名無し';
  const avatar = localStorage.getItem('userAvatar') || '';
  const isMe = author === name;

  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (isMe ? 'right' : 'left');

  // 投稿者行（アイコンと名前、サイズ拡大）
  const authorLine = document.createElement('div');
  authorLine.className = 'author-line';
  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.className = 'author-avatar';
    authorLine.appendChild(img);
  }
  const nameSpan = document.createElement('span');
  nameSpan.textContent = author;
  authorLine.appendChild(nameSpan);
  bubble.appendChild(authorLine);

  if (text) {
    const textDiv = document.createElement('div');
    textDiv.innerHTML = escapeHtml(text);
    bubble.appendChild(textDiv);
  }

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.style.maxWidth = '200px';
    img.style.borderRadius = '8px';
    img.style.marginTop = '6px';
    bubble.appendChild(img);
  }

  if (localStorage.getItem('showTime') !== 'off') {
    const timeDiv = document.createElement('div');
    timeDiv.style.fontSize = '10px';
    timeDiv.style.color = '#888';
    timeDiv.textContent = time ? new Date(time).toLocaleTimeString() : '';
    bubble.appendChild(timeDiv);
  }

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.justifyContent = isMe ? 'flex-end' : 'flex-start';
  wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// ===== Socket.io =====
socket.on('message', data => {
  if (String(data.room_id) !== String(window.currentRoomId)) return;
  appendMessage(data.author, data.text, data.time, data.image);
});

// ==========================
//  画面の初期化・イベント登録
// ==========================
window.addEventListener('DOMContentLoaded', () => {
  // 閉じるボタン
  document.getElementById('closeUserSettingsBtn').addEventListener('click', () => {
    document.getElementById('userSettingsPopup').style.display = 'none';
  });
  document.getElementById('closeRoomSettingsBtn').addEventListener('click', () => {
    document.getElementById('roomSettingsPopup').style.display = 'none';
  });

  // 設定ボタン
  document.getElementById('settingsBtn').addEventListener('click', () => {
    const popup = document.getElementById('userSettingsPopup');
    popup.style.display = 'flex';
    // 現在の設定を反映
    document.getElementById('darkModeToggle').checked = localStorage.getItem('darkMode') === 'on';
    document.getElementById('noticeToggle').checked = localStorage.getItem('noticeHidden') !== 'true';
    document.getElementById('enterSendToggle').checked = localStorage.getItem('enterSend') !== 'off';
    document.getElementById('timeToggle').checked = localStorage.getItem('showTime') !== 'off';
    document.getElementById('themeColorPicker').value = localStorage.getItem('themeColor') || '#2196f3';
    document.getElementById('fontSizeRange').value = localStorage.getItem('fontSize') || 14;
  });

  // ＋メニュー
  document.getElementById('addRoomBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('popup').style.display = 'flex';
  });
  document.getElementById('closePopupBtn').addEventListener('click', () => {
    document.getElementById('popup').style.display = 'none';
  });

  // ルーム作成（メニューを閉じてから）
  document.getElementById('btnCreateRoom').addEventListener('click', async () => {
    document.getElementById('popup').style.display = 'none'; // ★メニューを閉じる
    const data = await showRoomCreateModal();
    if (!data || !data.name) return;
    const creator = localStorage.getItem('userName') || '名無し';
    const res = await fetch('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, creator, password: data.password })
    });
    const result = await res.json();
    if (result?.room) {
      saveJoinedRoom(result.room.id);
      document.getElementById('roomCodeDisplay').style.display = 'block';
      document.getElementById('roomCodeDisplay').innerHTML = 'ルームコード: <strong>' + result.room.id + '</strong>';
    }
    loadRooms();
  });

  // ルーム参加（メニューを閉じてから）
  document.getElementById('btnJoinRoom').addEventListener('click', async () => {
    document.getElementById('popup').style.display = 'none'; // ★メニューを閉じる
    const input = await showRoomJoinModal();
    if (!input || !input.code) return;

    const res = await fetch('/rooms');
    const rooms = await res.json();
    const room = rooms.find(r => String(r.id) === String(input.code));
    if (!room) {
      await showAlert('ルームが見つかりません');
      return;
    }

    // パスワードチェック
    if (room.password && input.password !== room.password) {
      await showAlert('パスワードが違います');
      return;
    }

    saveJoinedRoom(room.id);
    loadRooms();
    openRoom(room.id);
  });

  // チャット送信
  document.getElementById('sendBtn').addEventListener('click', () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text && !selectedImageUrl) return;
    socket.emit('message', {
      roomId: window.currentRoomId,
      author: localStorage.getItem('userName') || '名無し',
      text,
      image: selectedImageUrl
    });
    input.value = '';
    selectedImageUrl = null;
  });

  // Enter送信
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.ctrlKey) {
      if (localStorage.getItem('enterSend') !== 'off') {
        e.preventDefault();
        document.getElementById('sendBtn').click();
      }
    }
  });

  // 戻るボタン
  document.getElementById('backBtn').addEventListener('click', () => {
    socket.emit('leaveRoom', window.currentRoomId);
    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'block';
    window.currentRoomId = null;
    document.getElementById('chatArea').innerHTML = '';
  });

  // メディアポップアップ
  const mediaBtn = document.getElementById('mediaBtn');
  const mediaPopup = document.getElementById('mediaPopup');
  const closeMediaBtn = document.getElementById('closeMediaBtn');
  const imageUrlInput = document.getElementById('imageUrlInput');
  const imagePreview = document.getElementById('imagePreview');

  mediaBtn.addEventListener('click', () => { mediaPopup.style.display = 'flex'; });
  closeMediaBtn.addEventListener('click', () => { mediaPopup.style.display = 'none'; });
  imageUrlInput.addEventListener('input', () => {
    const url = imageUrlInput.value.trim();
    if (!url) {
      imagePreview.style.display = 'none';
      selectedImageUrl = null;
      return;
    }
    imagePreview.src = url;
    imagePreview.style.display = 'block';
    selectedImageUrl = url;
  });

  // 名前保存
  document.getElementById('saveNameBtn').addEventListener('click', async () => {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
      await showAlert('名前を入力してください');
      return;
    }
    const avatar = document.getElementById('avatarUrlInput').value.trim() || '';
    localStorage.setItem('userName', name);
    localStorage.setItem('userAvatar', avatar);
    document.getElementById('userNameDisplay').textContent = name;
    const avatarEl = document.getElementById('userAvatarDisplay');
    if (avatar) {
      avatarEl.src = avatar;
      avatarEl.style.display = 'inline';
    } else {
      avatarEl.style.display = 'none';
    }
    document.getElementById('namePopup').style.display = 'none';

    // Supabase にユーザー情報保存
    const uuid = getUserUUID();
    fetch('/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uuid, name, avatar_url: avatar }),
    }).catch(console.error);
  });

  // 設定内の変更イベント
  document.getElementById('darkModeToggle').addEventListener('change', e => {
    localStorage.setItem('darkMode', e.target.checked ? 'on' : 'off');
    document.body.style.background = e.target.checked ? '#111' : '';
    document.body.style.color = e.target.checked ? '#eee' : '';
  });
  document.getElementById('noticeToggle').addEventListener('change', e => {
    localStorage.setItem('noticeHidden', e.target.checked ? 'false' : 'true');
  });
  document.getElementById('enterSendToggle').addEventListener('change', e => {
    localStorage.setItem('enterSend', e.target.checked ? 'on' : 'off');
  });
  document.getElementById('timeToggle').addEventListener('change', e => {
    localStorage.setItem('showTime', e.target.checked ? 'on' : 'off');
  });
  document.getElementById('themeColorPicker').addEventListener('input', e => {
    document.documentElement.style.setProperty('--theme', e.target.value);
    localStorage.setItem('themeColor', e.target.value);
  });
  document.getElementById('fontSizeRange').addEventListener('input', e => {
    document.body.style.fontSize = e.target.value + 'px';
    localStorage.setItem('fontSize', e.target.value);
  });

  // 名前変更・アイコン変更
  document.getElementById('changeNameBtn').addEventListener('click', async () => {
    const now = localStorage.getItem('userName') || '';
    const name = await showPrompt('新しい名前', now);
    if (name === null || name.trim() === '') return;
    localStorage.setItem('userName', name.trim());
    document.getElementById('userNameDisplay').textContent = name.trim();
    const uuid = getUserUUID();
    fetch('/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uuid, name: name.trim(), avatar_url: localStorage.getItem('userAvatar') || '' }),
    }).catch(console.error);
  });

  document.getElementById('changeAvatarBtn').addEventListener('click', async () => {
    const now = localStorage.getItem('userAvatar') || '';
    const url = await showPrompt('新しいアイコンURL', now);
    if (url === null) return;
    const trimmed = url.trim();
    localStorage.setItem('userAvatar', trimmed);
    const avatarEl = document.getElementById('userAvatarDisplay');
    if (trimmed) {
      avatarEl.src = trimmed;
      avatarEl.style.display = 'inline';
    } else {
      avatarEl.style.display = 'none';
    }
    const uuid = getUserUUID();
    fetch('/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: uuid, name: localStorage.getItem('userName') || '', avatar_url: trimmed }),
    }).catch(console.error);
  });

  // 規約・プライバシー
  document.getElementById('agreeTermsBtn').addEventListener('click', () => {
    localStorage.setItem('termsAgreed', 'true');
    document.getElementById('termsPopup').style.display = 'none';
  });
  document.getElementById('agreePrivacyBtn').addEventListener('click', () => {
    localStorage.setItem('privacyAgreed', 'true');
    document.getElementById('privacyPopup').style.display = 'none';
  });
  document.getElementById('openTermsBtn').addEventListener('click', () => {
    document.getElementById('termsPopup').style.display = 'flex';
  });
  document.getElementById('openPrivacyBtn').addEventListener('click', () => {
    document.getElementById('privacyPopup').style.display = 'flex';
  });

  // ルーム設定の退会
  document.getElementById('leaveRoomFromSettings').addEventListener('click', async () => {
    if (!selectedRoomForSettings) return;
    const ok = await showConfirm('本当に退会しますか？');
    if (!ok) return;
    const user = localStorage.getItem('userName') || '名無し';
    await fetch('/rooms/' + selectedRoomForSettings.id + '/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });
    const key = 'joinedRooms';
    const rooms = JSON.parse(localStorage.getItem(key) || '[]').filter(id => id !== String(selectedRoomForSettings.id));
    localStorage.setItem(key, JSON.stringify(rooms));
    document.getElementById('roomSettingsPopup').style.display = 'none';
    loadRooms();
  });

  // 初期表示
  const user = localStorage.getItem('userName');
  if (!user) {
    document.getElementById('namePopup').style.display = 'flex';
  } else {
    document.getElementById('userNameDisplay').textContent = user;
    const avatar = localStorage.getItem('userAvatar');
    if (avatar) {
      document.getElementById('userAvatarDisplay').src = avatar;
      document.getElementById('userAvatarDisplay').style.display = 'inline';
    }
  }

  // お知らせ
  loadNotice();
  loadRooms();

  // ダークモード・フォントサイズ初期反映
  if (localStorage.getItem('darkMode') === 'on') {
    document.body.style.background = '#111';
    document.body.style.color = '#eee';
  }
  document.body.style.fontSize = (localStorage.getItem('fontSize') || 14) + 'px';
  const theme = localStorage.getItem('themeColor');
  if (theme) document.documentElement.style.setProperty('--theme', theme);

  // 未同意なら規約・プライバシー表示
  if (localStorage.getItem('termsAgreed') !== 'true') {
    document.getElementById('termsPopup').style.display = 'flex';
  }
  if (localStorage.getItem('privacyAgreed') !== 'true') {
    document.getElementById('privacyPopup').style.display = 'flex';
  }
});

// ===== お知らせ =====
async function loadNotice() {
  const res = await fetch('/notice');
  const data = await res.json();

  if (!data?.content) return;

  // 設定がオフなら表示しない
  if (localStorage.getItem('noticeHidden') === 'true') return;

  document.getElementById('noticeText').textContent = data.content.trim();
  document.getElementById('noticeBox').style.display = 'block';

  // ×は「その場だけ閉じる」
  document.getElementById('closeNoticeBtn').onclick = () => {
    document.getElementById('noticeBox').style.display = 'none';
  };
}

// ===== ルーム設定 =====
let selectedRoomForSettings = null;

async function openRoomSettings(room) {
  selectedRoomForSettings = room;
  const res = await fetch('/rooms/' + room.id + '/members');
  const members = await res.json();
  const box = document.getElementById('roomSettingsInfo');
  box.innerHTML = `
    <div><strong>ルーム名：</strong>${room.name}</div>
    <div><strong>作成者：</strong>${room.creator || '-'}</div>
    <div style="margin-top:8px;"><strong>メンバー：</strong></div>
    <ul>${members.map(m => `<li>${m.user}</li>`).join('')}</ul>
  `;
  document.getElementById('roomSettingsPopup').style.display = 'flex';
}

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
