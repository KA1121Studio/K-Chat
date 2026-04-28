// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

// ---------- Supabase ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ---------- ミドルウェア ----------
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static('public'));

// レート制限（全体）
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分
  max: 200, // 最大リクエスト数
  message: 'リクエストが多すぎます。しばらく待ってください。'
});
app.use(limiter);

// 管理API用認証ミドルウェア
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: '認証が必要です' });
  }
  next();
}

// ---------- 管理画面ログイン ----------
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' });
  }
  res.json({ token: process.env.ADMIN_API_KEY });
});

// ---------- ユーザー管理 ----------
app.post('/user', async (req, res) => {
  const { id, name, avatar_url } = req.body;
  if (!id || !name) return res.status(400).json({ error: '必須項目不足' });

  const { data, error } = await supabase
    .from('users')
    .upsert({ id, name, avatar_url }, { onConflict: 'id' });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'ユーザー情報の保存に失敗' });
  }
  res.json({ success: true });
});

// ---------- ルームAPI ----------
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000);
}

app.get('/rooms', async (req, res) => {
  const { data, error } = await supabase.from('rooms').select('*');
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.post('/rooms', async (req, res) => {
  const { name, creator, password } = req.body;
  if (!name) return res.status(400).json({ error: '名前が必要' });

  const room = {
    id: generateRoomId(),
    name,
    creator,
    password: password || null,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from('rooms').insert(room);
  if (error) return res.status(500).json({ error });

  res.json({ success: true, room });
});

app.post('/rooms/:id/join', async (req, res) => {
  const roomId = Number(req.params.id);
  const { user } = req.body;
  if (!user) return res.status(400).json({ error: 'ユーザー名が必要' });

  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user', user)
    .maybeSingle();

  if (existing) return res.json({ ok: true, alreadyJoined: true });

  await supabase.from('members').insert({ room_id: roomId, user });
  res.json({ ok: true });
});

app.post('/rooms/:id/check-password', async (req, res) => {
  const roomId = Number(req.params.id);
  const { password } = req.body;
  const { data: room } = await supabase.from('rooms').select('password').eq('id', roomId).single();
  if (!room || room.password !== password) {
    return res.status(403).json({ error: 'パスワード不一致' });
  }
  res.json({ ok: true });
});

app.get('/rooms/:id/messages', async (req, res) => {
  const roomId = Number(req.params.id);

  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      users (
        id,
        name,
        avatar_url
      )
    `)
    .eq('room_id', roomId)
    .order('time', { ascending: true });

  if (error) return res.status(500).json({ error });

  res.json(data);
});

app.delete('/rooms/:id', adminAuth, async (req, res) => {
  const roomId = Number(req.params.id);
  await supabase.from('messages').delete().eq('room_id', roomId);
  await supabase.from('members').delete().eq('room_id', roomId);
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
});

app.post('/rooms/:id/leave', async (req, res) => {
  const roomId = Number(req.params.id);
  const { user } = req.body;
  await supabase.from('members').delete().eq('room_id', roomId).eq('user', user);
  res.json({ ok: true });
});

app.get('/rooms/:id/members', async (req, res) => {
  const roomId = Number(req.params.id);
  const { data, error } = await supabase.from('members').select('user').eq('room_id', roomId);
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// お知らせ
app.get('/notice', async (req, res) => {
  const { data } = await supabase.from('notice').select('content,updated_at').eq('id', 1).single();
  res.json(data || { content: '' });
});

app.post('/notice', adminAuth, async (req, res) => {
  const { content } = req.body;
  const { error } = await supabase.from('notice').upsert({ id: 1, content, updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// ---------- Socket.IO ----------
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {

  socket.on('joinRoom', (roomId) => {
    socket.join(String(roomId));
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(String(roomId));
  });

  socket.on('message', async (data) => {
    const msg = {
      id: Date.now(),
      room_id: Number(data.roomId),
      user_id: data.user_id,
      text: data.text,
      image: data.image || null,
      time: new Date().toISOString()
    };

    await supabase.from('messages').insert(msg);
    io.to(String(data.roomId)).emit('message', msg);
  });

}); // ← 必要！！

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
