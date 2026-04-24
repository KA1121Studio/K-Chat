// public/admin.js
let authToken = '';

async function login() {
  const password = document.getElementById('adminPassword').value;
  const res = await fetch('/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    document.getElementById('loginError').textContent = 'パスワードが違います';
    return;
  }
  const data = await res.json();
  authToken = data.token;
  document.getElementById('loginBox').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  loadRooms();
  loadNotice();
}

async function loadRooms() {
  const res = await fetch('/rooms');
  const rooms = await res.json();
  const table = document.getElementById('roomTable');
  table.innerHTML = '<tr><th>ID</th><th>ルーム名</th><th>作成者</th><th>作成日時</th><th>削除</th></tr>';
  rooms.forEach(room => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${room.id}</td>
      <td>${room.name}</td>
      <td>${room.creator || '-'}</td>
      <td>${new Date(room.created_at).toLocaleString()}</td>
      <td><button class="deleteBtn" data-roomid="${room.id}">削除</button></td>
    `;
    table.appendChild(tr);
  });

  // 削除ボタンのイベントを設定
  document.querySelectorAll('.deleteBtn').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = this.getAttribute('data-roomid');
      deleteRoom(id);
    });
  });
}

async function deleteRoom(id) {
  if (!confirm('本当に削除しますか？')) return;
  const res = await fetch('/rooms/' + id, {
    method: 'DELETE',
    headers: { 'x-admin-token': authToken }
  });
  if (res.ok) {
    alert('削除しました');
    loadRooms();
  } else {
    alert('削除失敗');
  }
}

async function loadNotice() {
  const res = await fetch('/notice');
  const data = await res.json();
  document.getElementById('noticeInput').value = data.content || '';
}

async function saveNotice() {
  const content = document.getElementById('noticeInput').value;
  await fetch('/notice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': authToken
    },
    body: JSON.stringify({ content })
  });
  alert('保存しました');
}

// イベント登録
document.getElementById('loginButton').addEventListener('click', login);
document.getElementById('saveNoticeButton').addEventListener('click', saveNotice);
