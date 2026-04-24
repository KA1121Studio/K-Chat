// public/script.js
const socket = io();

// 共通
window.currentRoomId = null;
let selectedImageUrl = null;

// ===== カスタムモーダル制御 =====
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

// ルーム参加モーダル（コード）
function showRoomJoinModal() {
  return new Promise((resolve) => {
    document.getElementById('roomCodeInput').value = '';
    document.getElementById('roomJoinBox').style.display = 'flex';
    document.getElementById('roomJoinOkBtn').onclick = () => {
      const code = document.getElementById('roomCodeInput').value.trim();
      document.getElementById('roomJoinBox').style.display = 'none';
      resolve(code);
    };
    document.getElementById('roomJoinCancelBtn').onclick = () => {
      document.getElementById('roomJoinBox').style.display = 'none';
      resolve(null);
    };
  });
}

function showPopup(e) {
  if (e) e.stopPropagation();
  document.getElementById('popup').style.display = 'flex';
}
function closePopup() {
  document.getElementById('popup').style.display = 'none';
}

// ---- ユーザー情報 ----
function getUserUUID() {
  let uuid = localStorage.getItem('userUUID');
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem('userUUID', uuid);
  }
  return uuid;
}

// ---- 初期化 ----
window.addEventListener('load', async () => {
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
  loadNotice();
  loadRooms();
});

// ---- 名前/アイコン設定 ----
document.getElementById('saveNameBtn').onclick = async () => {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) {
    await showAlert('名前を入力してください');
    return;
  }
  const avatar = document.getElementById('avatarUrlInput').value.trim() || '';
  localStorage.setItem('userName', name);
  localStorage.setItem('userAvatar', avatar);
  document.getElementById('userNameDisplay').textContent = name;
  if (avatar) {
    document.getElementById('userAvatarDisplay').src = avatar;
    document.getElementById('userAvatarDisplay').style.display = 'inline';
  } else {
    document.getElementById('userAvatarDisplay').style.display = 'none';
  }
  document.getElementById('namePopup').style.display = 'none';

  // Supabase にユーザー情報を保存
  const uuid = getUserUUID();
  fetch('/user', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ id: uuid, name, avatar_url: avatar }),
  }).catch(console.error);
};

// ---- ルーム一覧読み込み ----
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

// ---- ルームを開く ----
async function openRoom(roomId) {
  closePopup();
  saveJoinedRoom(roomId);

  await fetch('/rooms/' + roomId + '/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: localStorage.getItem('userName') })
  });

  const res = await fetch('/rooms');
  const rooms = await res.json();
  const room = rooms.find(r => Number(r.id) === Number(roomId));
  if (!room) return showAlert('ルームがありません');

  // パスワード確認
  if (room.password) {
    const pw = await showPrompt('このルームにはパスワードが必要です。');
    if (pw === null) return; // キャンセル
    const checkRes = await fetch('/rooms/' + roomId + '/check-password', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: pw })
    });
    if (!checkRes.ok) {
      return showAlert('パスワードが違います');
    }
  }

  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display = 'block';
  document.getElementById('roomTitle').textContent = room.name;
  document.getElementById('roomInfo').textContent = '作成者: ' + (room.creator || '-');
  window.currentRoomId = String(room.id);
  socket.emit('joinRoom', String(room.id));
  await loadChat(room.id);
}

function saveJoinedRoom(roomId) {
  const key = 'joinedRooms';
  const rooms = JSON.parse(localStorage.getItem(key) || '[]');
  if (!rooms.includes(String(roomId))) {
    rooms.push(String(roomId));
    localStorage.setItem(key, JSON.stringify(rooms));
  }
}

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
  bubble.innerHTML = `
    <div style="font-size:12px; color:#444; display:flex; align-items:center;">
      ${avatar ? `<img src="${avatar}" style="width:20px;height:20px;border-radius:50%;margin-right:4px;">` : ''}
      ${author}
    </div>
    ${text ? `<div>${escapeHtml(text)}</div>` : ''}
    ${image ? `<img src="${image}" style="max-width:200px; border-radius:8px; margin-top:6px;">` : ''}
    ${localStorage.getItem('showTime') !== 'off' ? `<div style="font-size:10px; color:#888;">${time ? new Date(time).toLocaleTimeString() : ''}</div>` : ''}
  `;
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.justifyContent = isMe ? 'flex-end' : 'flex-start';
  wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ---- WebSocket ----
socket.on('message', data => {
  if (String(data.room_id) !== String(window.currentRoomId)) return;
  appendMessage(data.author, data.text, data.time, data.image);
});

// ---- ボタン設定 ----
document.getElementById('addRoomBtn').onclick = showPopup;
document.getElementById('closePopupBtn').onclick = closePopup;

document.getElementById('btnCreateRoom').onclick = async () => {
  const data = await showRoomCreateModal();
  if (!data || !data.name) return;
  const creator = localStorage.getItem('userName') || '名無し';
  const res = await fetch('/rooms', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name: data.name, creator, password: data.password })
  });
  const result = await res.json();
  if (result?.room) {
    saveJoinedRoom(result.room.id);
    document.getElementById('roomCodeDisplay').style.display = 'block';
    document.getElementById('roomCodeDisplay').innerHTML = 'ルームコード: <strong>' + result.room.id + '</strong>';
  }
  closePopup();
  loadRooms();
};

document.getElementById('btnJoinRoom').onclick = async () => {
  const code = await showRoomJoinModal();
  if (!code) return;
  const res = await fetch('/rooms');
  const rooms = await res.json();
  const room = rooms.find(r => String(r.id) === String(code));
  if (!room) {
    await showAlert('ルームが見つかりません');
    return;
  }
  saveJoinedRoom(room.id);
  closePopup();
  openRoom(room.id);
};

document.getElementById('sendBtn').onclick = () => {
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
};

document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.ctrlKey) {
    if (localStorage.getItem('enterSend') !== 'off') {
      e.preventDefault();
      document.getElementById('sendBtn').click();
    }
  }
});

document.getElementById('backBtn').onclick = () => {
  socket.emit('leaveRoom', window.currentRoomId);
  document.getElementById('chatScreen').style.display = 'none';
  document.getElementById('homeScreen').style.display = 'block';
  window.currentRoomId = null;
  document.getElementById('chatArea').innerHTML = '';
};

// メディアポップアップ
const mediaBtn = document.getElementById('mediaBtn');
const mediaPopup = document.getElementById('mediaPopup');
const closeMediaBtn = document.getElementById('closeMediaBtn');
const imageUrlInput = document.getElementById('imageUrlInput');
const imagePreview = document.getElementById('imagePreview');
mediaBtn.onclick = () => mediaPopup.style.display = 'flex';
closeMediaBtn.onclick = () => mediaPopup.style.display = 'none';
imageUrlInput.oninput = () => {
  const url = imageUrlInput.value.trim();
  if (!url) { imagePreview.style.display = 'none'; selectedImageUrl = null; return; }
  imagePreview.src = url;
  imagePreview.style.display = 'block';
  selectedImageUrl = url;
};

// ---- ルーム設定 ----
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
function closeRoomSettings() {
  document.getElementById('roomSettingsPopup').style.display = 'none';
}
document.getElementById('leaveRoomFromSettings').onclick = async () => {
  if (!selectedRoomForSettings) return;
  const ok = await showConfirm('本当に退会しますか？');
  if (!ok) return;
  const user = localStorage.getItem('userName') || '名無し';
  await fetch('/rooms/' + selectedRoomForSettings.id + '/leave', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ user })
  });
  const key = 'joinedRooms';
  const rooms = JSON.parse(localStorage.getItem(key) || '[]').filter(id => id !== String(selectedRoomForSettings.id));
  localStorage.setItem(key, JSON.stringify(rooms));
  closeRoomSettings();
  loadRooms();
};

// ---- 設定画面 ----
const userSettingsPopup = document.getElementById('userSettingsPopup');
document.getElementById('settingsBtn').onclick = () => {
  userSettingsPopup.style.display = 'flex';
  document.getElementById('darkModeToggle').checked = localStorage.getItem('darkMode') === 'on';
  document.getElementById('noticeToggle').checked = localStorage.getItem('noticeHidden') !== 'true';
  document.getElementById('enterSendToggle').checked = localStorage.getItem('enterSend') !== 'off';
  document.getElementById('timeToggle').checked = localStorage.getItem('showTime') !== 'off';
  document.getElementById('themeColorPicker').value = localStorage.getItem('themeColor') || '#2196f3';
  document.getElementById('fontSizeRange').value = localStorage.getItem('fontSize') || 14;
};
function closeUserSettings() { userSettingsPopup.style.display = 'none'; }

document.getElementById('darkModeToggle').onchange = e => {
  localStorage.setItem('darkMode', e.target.checked ? 'on' : 'off');
  document.body.style.background = e.target.checked ? '#111' : '';
  document.body.style.color = e.target.checked ? '#eee' : '';
};
document.getElementById('noticeToggle').onchange = e => localStorage.setItem('noticeHidden', e.target.checked ? 'false' : 'true');
document.getElementById('enterSendToggle').onchange = e => localStorage.setItem('enterSend', e.target.checked ? 'on' : 'off');
document.getElementById('timeToggle').onchange = e => localStorage.setItem('showTime', e.target.checked ? 'on' : 'off');
document.getElementById('themeColorPicker').oninput = e => {
  document.documentElement.style.setProperty('--theme', e.target.value);
  localStorage.setItem('themeColor', e.target.value);
};
document.getElementById('fontSizeRange').oninput = e => {
  document.body.style.fontSize = e.target.value + 'px';
  localStorage.setItem('fontSize', e.target.value);
};

document.getElementById('changeNameBtn').onclick = async () => {
  const now = localStorage.getItem('userName') || '';
  const name = await showPrompt('新しい名前', now);
  if (name === null || name.trim() === '') return;
  localStorage.setItem('userName', name.trim());
  document.getElementById('userNameDisplay').textContent = name.trim();
  // Supabase 更新
  const uuid = getUserUUID();
  fetch('/user', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ id: uuid, name: name.trim(), avatar_url: localStorage.getItem('userAvatar') }),
  }).catch(console.error);
};

document.getElementById('changeAvatarBtn').onclick = async () => {
  const now = localStorage.getItem('userAvatar') || '';
  const url = await showPrompt('新しいアイコンURL', now);
  if (url === null) return;
  const trimmed = url.trim();
  localStorage.setItem('userAvatar', trimmed);
  if (trimmed) {
    document.getElementById('userAvatarDisplay').src = trimmed;
    document.getElementById('userAvatarDisplay').style.display = 'inline';
  } else {
    document.getElementById('userAvatarDisplay').style.display = 'none';
  }
  // Supabase 更新
  const uuid = getUserUUID();
  fetch('/user', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ id: uuid, name: localStorage.getItem('userName'), avatar_url: trimmed }),
  }).catch(console.error);
};

// 規約・プライバシー
document.getElementById('agreeTermsBtn').onclick = () => {
  localStorage.setItem('termsAgreed', 'true');
  document.getElementById('termsPopup').style.display = 'none';
};
document.getElementById('agreePrivacyBtn').onclick = () => {
  localStorage.setItem('privacyAgreed', 'true');
  document.getElementById('privacyPopup').style.display = 'none';
};
document.getElementById('openTermsBtn').onclick = () => termsPopup.style.display = 'flex';
document.getElementById('openPrivacyBtn').onclick = () => privacyPopup.style.display = 'flex';
window.addEventListener('load', () => {
  if (localStorage.getItem('termsAgreed') !== 'true') termsPopup.style.display = 'flex';
  if (localStorage.getItem('privacyAgreed') !== 'true') privacyPopup.style.display = 'flex';
});

// 初期表示調整
window.addEventListener('load', () => {
  if (localStorage.getItem('darkMode') === 'on') {
    document.body.style.background = '#111';
    document.body.style.color = '#eee';
  }
  document.body.style.fontSize = (localStorage.getItem('fontSize') || 14) + 'px';
  const theme = localStorage.getItem('themeColor');
  if (theme) document.documentElement.style.setProperty('--theme', theme);
});

// お知らせ読み込み
async function loadNotice() {
  const res = await fetch('/notice');
  const data = await res.json();
  if (data?.content) {
    if (localStorage.getItem('noticeHidden') === 'true') return;
    document.getElementById('noticeText').textContent = data.content;
    document.getElementById('noticeBox').style.display = 'block';
    document.getElementById('closeNoticeBtn').onclick = () => {
      document.getElementById('noticeBox').style.display = 'none';
      localStorage.setItem('noticeHidden', 'true');
    };
  }
}

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
