const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env 가 없으면 아래 기본값(토스 문서용 테스트 키)으로 동작
}

const PORT = Number(process.env.PORT) || 3000;
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R';
const IS_LIVE = TOSS_SECRET_KEY.startsWith('live_');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEMBERS = 50;
const MAX_PHOTO_CHARS = 400_000;
const MIN_DONATION = 1000;
const MAX_DONATION = 1_000_000;

// ---------- 저장소 (메모리 + JSON 파일) ----------

/** rooms: code -> { code, name, createdAt, touchedAt, model, members: { [userId]: member } } */
let rooms = {};
/** orders: orderId -> { orderId, amount, name, message, status, createdAt, approvedAt, method } */
let orders = {};

function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    rooms = db.rooms || {};
    orders = db.orders || {};
    // 승인 도중 서버가 꺼졌던 주문은 다시 시도할 수 있게 되돌린다
    for (const order of Object.values(orders)) {
      if (order.status === 'CONFIRMING') order.status = 'READY';
    }
  } catch {
    rooms = {};
    orders = {};
  }
}

let saveTimer = null;
function saveDb() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify({ rooms, orders }), (err) => {
      if (err) return console.error('DB 저장 실패:', err.message);
      fs.rename(tmp, DB_FILE, (e) => e && console.error('DB 저장 실패:', e.message));
    });
  }, 1000);
}

loadDb();

// ---------- 유틸 ----------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRoomCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  } while (rooms[code]);
  return code;
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function elapsedOf(member, now = Date.now()) {
  return member.accumMs + (member.runningSince ? now - member.runningSince : 0);
}

function publicRoom(room) {
  return {
    code: room.code,
    name: room.name,
    model: room.model,
    members: Object.values(room.members).map((m) => ({
      id: m.id,
      name: m.name,
      anon: m.anon,
      accumMs: m.accumMs,
      runningSince: m.runningSince,
      convictions: m.convictions,
      alibi: m.alibi || '',
      photoV: m.photo ? m.photoV : 0,
      online: (sockets.get(room.code + ':' + m.id)?.size || 0) > 0,
    })),
  };
}

// ---------- HTTP ----------

const app = express();

// 화면을 다른 주소(GitHub Pages 등)에 올린 경우 그 주소의 요청만 허용한다. 쉼표로 여러 개 지정 가능.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://ashwdm9-sys.github.io')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '50kb' }));

app.get('/api/config', (req, res) => {
  res.json({ tossClientKey: TOSS_CLIENT_KEY, live: IS_LIVE, minDonation: MIN_DONATION, maxDonation: MAX_DONATION });
});

app.post('/api/rooms', (req, res) => {
  const name = cleanText(req.body?.name, 30) || '이름 없는 근절방';
  const code = newRoomCode();
  rooms[code] = { code, name, createdAt: Date.now(), touchedAt: Date.now(), model: null, members: {} };
  saveDb();
  res.status(201).json({ code, name });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = rooms[normalizeCode(req.params.code)];
  if (!room) return res.status(404).json({ error: '그런 방은 없습니다. 코드를 다시 확인하세요.' });
  res.json({ code: room.code, name: room.name, memberCount: Object.keys(room.members).length });
});

app.get('/api/rooms/:code/photo/:userId', (req, res) => {
  const member = rooms[normalizeCode(req.params.code)]?.members[req.params.userId];
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(member?.photo || '');
  if (!match) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(match[1], 'base64'));
});

// ---------- 후원 (토스페이먼츠) ----------

function donationSummary() {
  const done = Object.values(orders)
    .filter((o) => o.status === 'DONE')
    .sort((a, b) => b.approvedAt - a.approvedAt);
  return {
    total: done.reduce((sum, o) => sum + o.amount, 0),
    count: done.length,
    recent: done.slice(0, 20).map((o) => ({
      name: o.name,
      message: o.message,
      amount: o.amount,
      approvedAt: o.approvedAt,
    })),
  };
}

app.get('/api/donations', (req, res) => res.json(donationSummary()));

// 금액은 서버가 주문으로 기록해 두고, 승인 시 이 값과 대조한다 (클라이언트 변조 방지)
app.post('/api/donations/order', (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < MIN_DONATION || amount > MAX_DONATION) {
    return res.status(400).json({
      error: `후원 금액은 ${MIN_DONATION.toLocaleString()}원 이상 ${MAX_DONATION.toLocaleString()}원 이하의 정수여야 합니다.`,
    });
  }
  const orderId = 'dgb_' + crypto.randomBytes(12).toString('hex');
  orders[orderId] = {
    orderId,
    amount,
    name: cleanText(req.body?.name, 20) || '익명의 후원자',
    message: cleanText(req.body?.message, 60),
    status: 'READY',
    createdAt: Date.now(),
  };
  saveDb();
  res.status(201).json({ orderId, amount, orderName: '뒷공부 근절 캠페인 후원' });
});

app.post('/api/donations/confirm', async (req, res) => {
  const { paymentKey, orderId } = req.body || {};
  const amount = Number(req.body?.amount);
  const order = orders[orderId];
  if (!order || typeof paymentKey !== 'string') {
    return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  }
  if (order.amount !== amount) {
    return res.status(400).json({ error: '결제 금액이 주문과 일치하지 않습니다.' });
  }
  if (order.status === 'DONE') {
    return res.json({ ok: true, amount: order.amount, name: order.name, method: order.method });
  }
  if (order.status === 'CONFIRMING') {
    return res.status(409).json({ error: '이미 승인 처리 중인 결제입니다. 잠시 후 새로고침하세요.' });
  }

  order.status = 'CONFIRMING';
  try {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/json',
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
    });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok || payment.status !== 'DONE') {
      order.status = 'READY';
      saveDb();
      return res.status(response.ok ? 400 : response.status).json({
        error: payment.message || '결제 승인에 실패했습니다.',
        code: payment.code,
      });
    }
    order.status = 'DONE';
    order.approvedAt = Date.now();
    order.method = payment.method || '';
    order.paymentKey = paymentKey;
    saveDb();
    res.json({ ok: true, amount: order.amount, name: order.name, method: order.method });
  } catch (err) {
    order.status = 'READY';
    console.error('토스 승인 요청 실패:', err.message);
    res.status(502).json({ error: '결제사와 통신하지 못했습니다. 잠시 후 다시 시도하세요.' });
  }
});

// 로컬 실행용: 상위 폴더의 화면 파일을 같이 서빙한다. 서버 소스와 데이터는 노출하지 않는다.
// (GitHub Pages에 화면을 올린 경우에는 쓰이지 않는다)
const SITE_DIR = path.join(__dirname, '..');
app.use('/server', (req, res) => res.status(404).end());
app.use(express.static(SITE_DIR));

// ---------- WebSocket (방 실시간 동기화) ----------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 600_000 });

/** "CODE:userId" -> Set<ws> (같은 사람이 탭을 여러 개 열 수 있음) */
const sockets = new Map();

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.roomCode === room.code && client.readyState === client.OPEN) client.send(data);
  }
}

function broadcastState(room) {
  room.touchedAt = Date.now();
  broadcast(room, { type: 'state', room: publicRoom(room), now: Date.now() });
  saveDb();
}

// 메시지 종류별 최소 간격(ms)
const THROTTLE = { shout: 700, report: 250, photo: 3000, rename: 300, alibi: 300, timer: 200 };

const handlers = {
  rename(ws, room, me, msg) {
    const name = cleanText(msg.name, 12);
    if (!name || name === me.name) return;
    me.name = name;
    if (room.model?.userId === me.id) room.model.name = name;
    broadcastState(room);
  },

  // 빈 값이면 기본 알리바이로 돌아간다
  alibi(ws, room, me, msg) {
    const alibi = cleanText(msg.alibi, 16);
    if (alibi === (me.alibi || '')) return;
    me.alibi = alibi;
    broadcastState(room);
  },

  photo(ws, room, me, msg) {
    const photo = String(msg.dataUrl || '');
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO_CHARS) {
      return send(ws, { type: 'error', message: '사진을 처리하지 못했습니다. 다른 사진으로 시도하세요.' });
    }
    me.photo = photo;
    me.photoV = Date.now();
    room.model = { userId: me.id, name: me.name, at: me.photoV };
    broadcastState(room);
  },

  timer(ws, room, me, msg) {
    const now = Date.now();
    if (msg.action === 'start' && !me.runningSince) {
      me.runningSince = now;
    } else if (msg.action === 'stop' && me.runningSince) {
      me.accumMs = elapsedOf(me, now);
      me.runningSince = null;
    } else if (msg.action === 'reset') {
      me.accumMs = 0;
      me.runningSince = null;
    } else {
      return;
    }
    broadcastState(room);
  },

  shout(ws, room, me, msg) {
    const text = cleanText(msg.text, 24);
    if (!text) return;
    room.touchedAt = Date.now();
    broadcast(room, {
      type: 'shout',
      id: crypto.randomBytes(6).toString('hex'),
      text,
      anon: me.anon,
      x: 6 + Math.random() * 58,
      y: 22 + Math.random() * 62,
      rot: Math.round(Math.random() * 16 - 8),
      red: Math.random() < 0.6,
    });
  },

  report(ws, room, me, msg) {
    const target = room.members[msg.targetId];
    // 현행범만 고발할 수 있다. 검거되면 타이머가 멈추고 전과가 쌓인다.
    if (!target || target.id === me.id || !target.runningSince) return;
    target.accumMs = elapsedOf(target);
    target.runningSince = null;
    target.convictions += 1;
    broadcast(room, { type: 'busted', targetId: target.id, name: target.name, by: me.anon, convictions: target.convictions });
    broadcastState(room);
  },

  leave(ws, room, me) {
    delete room.members[me.id];
    if (room.model?.userId === me.id) room.model = null;
    const key = room.code + ':' + me.id;
    const mine = sockets.get(key) || new Set();
    sockets.delete(key);
    for (const client of mine) {
      client.roomCode = null;
      client.close(1000);
    }
    broadcastState(room);
  },
};

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.lastAt = {};
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') return join(ws, msg);

    const room = rooms[ws.roomCode];
    const me = room?.members[ws.userId];
    const handler = Object.hasOwn(handlers, msg.type) && handlers[msg.type];
    if (!me || !handler) return;

    const now = Date.now();
    if (now - (ws.lastAt[msg.type] || 0) < THROTTLE[msg.type]) return;
    ws.lastAt[msg.type] = now;
    handler(ws, room, me, msg);
  });

  ws.on('close', () => {
    const room = rooms[ws.roomCode];
    if (!room) return;
    const key = ws.roomCode + ':' + ws.userId;
    const set = sockets.get(key);
    set?.delete(ws);
    if (set && set.size === 0) {
      sockets.delete(key);
      broadcastState(room);
    }
  });
});

function join(ws, msg) {
  if (ws.roomCode) return;
  const room = rooms[normalizeCode(msg.code)];
  const userId = String(msg.userId || '');
  if (!room) return send(ws, { type: 'error', fatal: true, message: '방이 사라졌거나 코드가 잘못됐습니다.' });
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(userId)) return send(ws, { type: 'error', fatal: true, message: '잘못된 접속입니다.' });

  let me = room.members[userId];
  if (!me) {
    if (Object.keys(room.members).length >= MAX_MEMBERS) {
      return send(ws, { type: 'error', fatal: true, message: '방이 꽉 찼습니다. (최대 50명)' });
    }
    const anon = '익명' + (100 + Math.floor(Math.random() * 900));
    me = room.members[userId] = {
      id: userId,
      name: cleanText(msg.name, 12) || anon,
      anon,
      accumMs: 0,
      runningSince: null,
      convictions: 0,
      alibi: cleanText(msg.alibi, 16),
      photo: null,
      photoV: 0,
      joinedAt: Date.now(),
    };
  }

  ws.roomCode = room.code;
  ws.userId = userId;
  const key = room.code + ':' + userId;
  if (!sockets.has(key)) sockets.set(key, new Set());
  sockets.get(key).add(ws);

  send(ws, { type: 'joined', you: userId, anon: me.anon });
  broadcastState(room);
}

// 죽은 연결 정리 + 오래 방치된 방 삭제
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

setInterval(() => {
  const now = Date.now();
  let removed = false;
  for (const room of Object.values(rooms)) {
    if (now - room.touchedAt > ROOM_TTL_MS) {
      delete rooms[room.code];
      removed = true;
    }
  }
  if (removed) saveDb();
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`뒷공부 근절 캠페인 서버: http://localhost:${PORT}`);
  console.log(`결제 모드: ${IS_LIVE ? '실결제(live 키)' : '테스트(실제 출금 없음)'}`);
});
