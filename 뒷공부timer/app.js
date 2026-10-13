import { $, el, toast, store, api, ago, API_BASE, noBackend, wsUrl } from './common.js';

const PRESETS = ['공부 그만!!', '책 덮어라', '너 지금 공부하지?', '배신자 색출 중', 'PC방 ㄱ?', '떡볶이 사라', '다 보인다', '형광펜 내려놔'];
const DEFAULT_ALIBI = '릴스 넘기는 중';
const MAX_SHOUTS = 12;

const userId = getUserId();
let ws = null;
let roomCode = null;
let room = null; // 서버가 보내준 최신 방 상태
let clockOffset = 0; // 서버 시각 - 내 시각
let retryMs = 1000;
let retryTimer = null;
let renderedOrder = '';

function getUserId() {
  let id = store.get('dgb:userId');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set('dgb:userId', id);
  }
  return id;
}

const serverNow = () => Date.now() + clockOffset;
const elapsedOf = (m) => m.accumMs + (m.runningSince ? Math.max(0, serverNow() - m.runningSince) : 0);

function clock(ms) {
  const total = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// ---------- 화면 전환 ----------

function showLobby() {
  $('#room').hidden = true;
  $('#lobby').hidden = false;
  document.title = '뒷공부 근절 캠페인';
}

function goLobby() {
  disconnect();
  history.pushState(null, '', location.pathname);
  showLobby();
}

function enterRoom(code, name) {
  roomCode = code;
  room = null;
  renderedOrder = '';
  $('#lobby').hidden = true;
  $('#room').hidden = false;
  $('#room-title').textContent = name;
  $('#room-code').textContent = code;
  $('#wanted-list').replaceChildren();
  $('#shouts').replaceChildren();
  delete $('#model').dataset.src;
  $('#model').replaceChildren(emptyModel);
  $('#model-tag').hidden = true;
  $('#my-name').value = store.get('dgb:name') || '';
  document.title = `${name} · 뒷공부 근절 캠페인`;
  connect();
}

async function route() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return showLobby();
  try {
    const info = await api('/api/rooms/' + encodeURIComponent(code));
    enterRoom(info.code, info.name);
  } catch (err) {
    showLobby();
    toast(err.message);
    history.replaceState(null, '', location.pathname);
  }
}

// ---------- 로비 ----------

$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const created = await api('/api/rooms', { method: 'POST', body: { name: $('#room-name').value } });
    history.pushState(null, '', '?room=' + created.code);
    enterRoom(created.code, created.name);
    $('#room-name').value = '';
  } catch (err) {
    toast(err.message);
  }
});

$('#join-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 6) return toast('방 코드는 6자리입니다.');
  try {
    const info = await api('/api/rooms/' + encodeURIComponent(code));
    history.pushState(null, '', '?room=' + info.code);
    enterRoom(info.code, info.name);
    $('#join-code').value = '';
  } catch (err) {
    toast(err.message);
  }
});

window.addEventListener('popstate', () => {
  disconnect();
  route();
});

// ---------- 실시간 연결 ----------

function connect() {
  clearTimeout(retryTimer);
  const code = roomCode;
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.addEventListener('open', () => {
    retryMs = 1000;
    $('#conn').hidden = true;
    socket.send(JSON.stringify({ type: 'join', code, userId, name: store.get('dgb:name') || '', alibi: store.get('dgb:alibi') || '' }));
  });

  socket.addEventListener('message', (event) => {
    if (socket !== ws) return;
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      clockOffset = msg.now - Date.now();
      room = msg.room;
      renderRoom();
    } else if (msg.type === 'shout') {
      addShout(msg);
    } else if (msg.type === 'studynote') {
      toast(`📖 ${msg.name}님이 ${msg.place}에서 ${msg.subject} 앞공부 시작!`, 3500);
    } else if (msg.type === 'gather') {
      onGather(msg);
    } else if (msg.type === 'chaos') {
      startChaos(msg.by, msg.mode);
    } else if (msg.type === 'busted') {
      onBusted(msg);
    } else if (msg.type === 'error') {
      toast(msg.message);
      if (msg.fatal) goLobby();
    }
  });

  socket.addEventListener('close', () => {
    if (socket !== ws || roomCode !== code) return;
    $('#conn').hidden = false;
    retryTimer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 15000);
  });
}

function disconnect() {
  clearTimeout(retryTimer);
  roomCode = null;
  room = null;
  const socket = ws;
  ws = null;
  socket?.close();
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  toast('연결이 끊겨 있습니다. 잠시만요.');
  return false;
}

// ---------- 방 렌더링 ----------

const me = () => room?.members.find((m) => m.id === userId);
const studyElapsedOf = (m) => (m.studyAccumMs || 0) + (m.studySince ? Math.max(0, serverNow() - m.studySince) : 0);
const photoUrl = (m) => `${API_BASE}/api/rooms/${room.code}/photo/${encodeURIComponent(m.id)}?v=${m.photoV}`;
const sortedMembers = () => [...room.members].sort((a, b) => elapsedOf(b) - elapsedOf(a) || a.name.localeCompare(b.name, 'ko'));

function renderRoom() {
  $('#room-title').textContent = room.name;

  const mine = me();
  if (mine) {
    const input = $('#my-name');
    if (document.activeElement !== input) input.value = mine.name;
    const alibiInput = $('#my-alibi');
    alibiInput.placeholder = DEFAULT_ALIBI;
    if (document.activeElement !== alibiInput) alibiInput.value = mine.alibi || '';
    $('#toggle-timer').textContent = mine.runningSince ? '책 덮기 (완전범죄)' : '책 몰래 펴기 (배신)';
    $('#toggle-timer').classList.toggle('btn-red', !mine.runningSince);
    $('#toggle-timer').classList.toggle('btn-black', !!mine.runningSince);
    $('#my-timer').classList.toggle('running', !!mine.runningSince);
  }

  renderModel();
  renderList();
  renderStudy();
  tick();
}

const emptyModel = $('#model').firstElementChild; // 모델이 없을 때 보여줄 "공석" 안내

function renderModel() {
  const box = $('#model');
  const tag = $('#model-tag');
  const model = room.model && room.members.find((m) => m.id === room.model.userId && m.photoV);
  if (!model) {
    if (box.dataset.src) {
      delete box.dataset.src;
      box.replaceChildren(emptyModel);
    }
    tag.hidden = true;
    return;
  }
  const src = photoUrl(model);
  if (box.dataset.src !== src) {
    box.dataset.src = src;
    // crossOrigin 을 src 보다 먼저 줘야 난장판 효과가 사진에서 눈 위치를 읽을 수 있다
    const img = el('img', { crossOrigin: 'anonymous', src, alt: `캠페인 모델 ${model.name}` });
    box.replaceChildren(img);
    window.SuperChaos?.prepare(img);
  }
  tag.hidden = false;
  tag.textContent = `캠페인 모델 ${model.name} · ${ago(room.model.at, serverNow())}`;
}

function renderList() {
  const members = sortedMembers();
  renderedOrder = members.map((m) => m.id).join(',');
  $('#count-all').textContent = members.length;
  $('#count-run').textContent = members.filter((m) => m.runningSince).length + '명';

  $('#wanted-list').replaceChildren(
    ...members.map((m, index) => {
      const isMe = m.id === userId;
      const running = !!m.runningSince;
      const studying = !!m.studySince;
      const total = elapsedOf(m);
      const badge = studying
        ? el('span', { class: 'badge good' }, '정정당당')
        : running
          ? el('span', { class: 'badge bad' }, '현행범')
          : m.convictions > 0
          ? el('span', { class: 'badge warn' }, `전과 ${m.convictions}범`)
          : total > 0
            ? el('span', { class: 'badge warn' }, '청정?시민')
            : el('span', { class: 'badge' }, '청정 시민');
      const status = studying
        ? `📖 앞공부 중 · ${m.place} · ${m.subject}`
        : running
          ? '뒷공부 중 (현장 적발 가능!)'
          : `${m.alibi || DEFAULT_ALIBI} (주장)${m.online ? '' : ' · 잠적'}`;

      return el(
        'li',
        { class: `wanted-item${running ? ' running' : ''}${studying ? ' studying' : ''}${m.online ? '' : ' offline'}` },
        el('span', { class: 'rank' }, String(index + 1)),
        m.photoV
          ? el('img', { class: 'avatar', src: photoUrl(m), alt: '' })
          : el('span', { class: 'avatar' }, [...m.name][0] || '?'),
        el(
          'div',
          { class: 'who' },
          el(
            'div',
            { class: 'who-line' },
            el('span', { class: 'who-name' }, m.name),
            isMe && el('span', { class: 'who-me' }, '(나)'),
            badge,
          ),
          el('span', { class: 'alibi' }, status),
        ),
        el(
          'div',
          { class: 'tally' },
          el('span', { class: 'tally-time', dataset: { timeOf: m.id } }, clock(total)),
          el(
            'button',
            {
              class: 'report',
              type: 'button',
              disabled: isMe || !running,
              title: isMe ? '본인은 고발할 수 없습니다' : running ? `${m.name} 고발하기` : '뒷공부 중일 때만 고발할 수 있습니다',
              dataset: { report: m.id },
            },
            '고발',
          ),
        ),
      );
    }),
  );
}

// 1초마다 시간만 갱신하고, 순위가 뒤집혔을 때만 목록을 다시 그린다
function tick() {
  if (!room) return;
  const mine = me();
  if (mine) {
    $('#my-timer').textContent = clock(elapsedOf(mine));
    $('#study-timer').textContent = clock(studyElapsedOf(mine));
  }
  if (studyRankOrder() !== renderedStudyRank) renderStudy();
  for (const m of room.members) {
    if (!m.studySince) continue;
    for (const node of document.querySelectorAll(`[data-study-time-of="${CSS.escape(m.id)}"]`)) {
      node.textContent = clock(studyElapsedOf(m));
    }
  }

  if (sortedMembers().map((m) => m.id).join(',') !== renderedOrder) return renderList();
  for (const m of room.members) {
    if (!m.runningSince) continue;
    const node = $(`[data-time-of="${CSS.escape(m.id)}"]`);
    if (node) node.textContent = clock(elapsedOf(m));
  }
}

setInterval(tick, 1000);
setInterval(() => room && renderModel(), 30_000);

// ---------- 정정당당 앞공부 ----------

let renderedStudyRank = '';
const studyRanked = () =>
  room.members
    .filter((m) => studyElapsedOf(m) > 0)
    .sort((a, b) => studyElapsedOf(b) - studyElapsedOf(a) || a.name.localeCompare(b.name, 'ko'));
const studyRankOrder = () => (room ? studyRanked().map((m) => m.id).join(',') : '');

function renderStudy() {
  const mine = me();
  const studying = !!mine?.studySince;
  const toggle = $('#study-toggle');
  toggle.textContent = studying ? '앞공부 끝 (수고했어요)' : '앞공부 시작 (정정당당)';
  toggle.classList.toggle('on', studying);

  const placeInput = $('#study-place');
  const subjectInput = $('#study-subject');
  if (studying) {
    if (document.activeElement !== placeInput) placeInput.value = mine.place;
    if (document.activeElement !== subjectInput) subjectInput.value = mine.subject;
  } else {
    if (!placeInput.value && document.activeElement !== placeInput) placeInput.value = store.get('dgb:place') || '';
    if (!subjectInput.value && document.activeElement !== subjectInput) subjectInput.value = store.get('dgb:subject') || '';
  }

  // 지금 앞공부 중인 사람을 장소별로 묶어서 "누가 어디서 무슨 과목" 을 보여준다
  const now = room.members.filter((m) => m.studySince);
  $('#study-sub').textContent = now.length ? `지금 ${now.length}명이 앞공부 중! 같이 해요` : '다들 어디야? 만나서 앞공부 하자!';
  const places = new Map();
  for (const m of now) places.set(m.place, [...(places.get(m.place) || []), m]);
  $('#study-board').replaceChildren(
    ...(now.length
      ? [...places].map(([place, people]) =>
          el(
            'div',
            { class: 'study-place' },
            el('div', { class: 'study-place-head' }, `📍 ${place} (${people.length}명)`),
            el(
              'ul',
              {},
              ...people.map((m) =>
                el(
                  'li',
                  {},
                  el('span', { class: 'study-who' }, el('b', {}, m.name), m.id === userId ? ' (나)' : '', el('span', {}, ` · ${m.subject} 공부중!`)),
                  el('span', { class: 'study-time', dataset: { studyTimeOf: m.id } }, clock(studyElapsedOf(m))),
                ),
              ),
            ),
          ),
        )
      : [el('p', { class: 'study-empty' }, '아직 아무도 앞공부 중이 아닙니다. 첫 번째 정정당당 시민이 되어주세요.')]),
  );

  const ranked = studyRanked();
  renderedStudyRank = ranked.map((m) => m.id).join(',');
  $('#study-rank').replaceChildren(
    ...ranked.map((m, i) =>
      el(
        'li',
        {},
        el('span', { class: 'rank' }, String(i + 1)),
        el('span', { class: 'study-who' }, el('b', {}, m.name), m.studySince ? el('span', {}, ` · 📍${m.place} · ${m.subject}`) : ''),
        el('span', { class: 'study-time', dataset: { studyTimeOf: m.id } }, clock(studyElapsedOf(m))),
      ),
    ),
  );
}

$('#study-btn').addEventListener('click', () => {
  const panel = $('#study-panel');
  panel.hidden = !panel.hidden;
  $('#study-btn').setAttribute('aria-expanded', String(!panel.hidden));
  if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$('#study-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (me()?.studySince) return send({ type: 'study', action: 'stop' });
  const place = $('#study-place').value.trim();
  const subject = $('#study-subject').value.trim();
  if (!place || !subject) return toast('어디서 무슨 과목을 공부하는지 적어주세요.');
  store.set('dgb:place', place);
  store.set('dgb:subject', subject);
  send({ type: 'study', action: 'start', place, subject });
});

// 공부 중에 장소나 과목을 바꾸면 바로 반영한다
let studyEditTimer = null;
for (const input of [$('#study-place'), $('#study-subject')]) {
  input.addEventListener('input', () => {
    clearTimeout(studyEditTimer);
    studyEditTimer = setTimeout(() => {
      const place = $('#study-place').value.trim();
      const subject = $('#study-subject').value.trim();
      store.set('dgb:place', place);
      store.set('dgb:subject', subject);
      if (me()?.studySince && place && subject) send({ type: 'study', action: 'update', place, subject });
    }, 600);
  });
}

let gatherAt = 0;
$('#gather-btn').addEventListener('click', () => {
  if (Date.now() - gatherAt < 4000) return toast('잠깐만요, 방금 외쳤습니다.');
  if (send({ type: 'gather', place: $('#study-place').value.trim() })) gatherAt = Date.now();
});

function onGather(msg) {
  const where = msg.place ? `${msg.place}에서 ` : '';
  toast(`📣 ${msg.name}님: 다들 어디야? ${where}만나서 앞공부 하자!`, 5000);
  addShout({
    text: msg.place ? `${msg.place}에서 앞공부 ㄱ?` : '다들 어디야? 앞공부 ㄱ?',
    anon: msg.name,
    x: 6 + Math.random() * 58,
    y: 22 + Math.random() * 62,
    rot: Math.round(Math.random() * 16 - 8),
    red: false,
  });
}

// ---------- 검거 (고발당함) ----------

let audio = null;
// 브라우저는 사용자 조작 없이 소리를 못 내므로, 타이머를 켜는 클릭에서 미리 열어둔다
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function playSiren(seconds = 3) {
  if (!audio || audio.state !== 'running') return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const t0 = audio.currentTime;
  osc.type = 'square';
  for (let i = 0; i * 0.25 < seconds; i++) {
    osc.frequency.setValueAtTime(i % 2 ? 660 : 990, t0 + i * 0.25);
  }
  gain.gain.setValueAtTime(0.18, t0);
  gain.gain.setValueAtTime(0.18, t0 + seconds - 0.1);
  gain.gain.linearRampToValueAtTime(0, t0 + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + seconds);
}

function onBusted(msg) {
  if (msg.targetId !== userId) {
    return toast(`🚨 ${msg.name} 검거! 전과 ${msg.convictions}범`, 3500);
  }
  playSiren();
  navigator.vibrate?.([300, 100, 300, 100, 300]);
  $('#busted-count').textContent = `전과 ${msg.convictions}범`;
  $('#busted-by').textContent = `${msg.by}의 고발로 뒷공부가 적발됐습니다. 타이머는 정지됐습니다.`;
  $('#busted').hidden = false;
}

$('#busted-ok').addEventListener('click', () => ($('#busted').hidden = true));

// ---------- 슈퍼난장판 ----------

const CHAOS_COOLDOWN_MS = 10_000; // 서버와 같은 값
let chaosAt = 0;

function startChaos(by, mode = 'fire') {
  chaosAt = Date.now();
  window.SuperChaos?.run({
    mode,
    image: $('#model img'),
    face: $('#model'), // 싸다구에 맞고 흔들리는 포스터 모델 박스
    hand: $('.poster-hand'), // 포스터의 손이 직접 날아가 때린다
    nick: by,
  });
}

$('#chaos-btn').addEventListener('click', () => {
  const wait = CHAOS_COOLDOWN_MS - (Date.now() - chaosAt);
  if (wait > 0) return toast(`난장판은 ${Math.ceil(wait / 1000)}초 뒤에 다시 터뜨릴 수 있습니다.`);
  // 소리는 클릭한 순간에 시작해야 브라우저가 막지 않으므로, 모드를 고르는 클릭 안에서 바로 터뜨린다(서버 응답을 기다리지 않음)
  const fire = (mode) => {
    if (send({ type: 'chaos', mode })) startChaos(me()?.anon, mode);
  };
  if (window.SuperChaos) window.SuperChaos.choose(fire);
  else fire('fire');
});

// ---------- 한마디 던지기 ----------

function addShout(msg) {
  const layer = $('#shouts');
  while (layer.children.length >= MAX_SHOUTS) layer.firstChild.remove();
  const bubble = el('div', { class: `shout${msg.red ? ' red' : ''}` }, msg.text, el('small', {}, `— ${msg.anon}`));
  bubble.style.left = msg.x + '%';
  bubble.style.top = msg.y + '%';
  bubble.style.setProperty('--rot', msg.rot + 'deg');
  bubble.addEventListener('animationend', () => bubble.remove());
  layer.append(bubble);
}

$('#chips').append(
  ...PRESETS.map((text) => {
    const chip = el('button', { class: 'chip', type: 'button' }, text);
    chip.addEventListener('click', () => send({ type: 'shout', text }));
    return chip;
  }),
);

$('#shout-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#shout-input');
  const text = input.value.trim() || input.placeholder;
  if (send({ type: 'shout', text })) input.value = '';
});

// ---------- 내 정보 ----------

let renameTimer = null;
$('#my-name').addEventListener('input', (event) => {
  clearTimeout(renameTimer);
  const name = event.target.value.trim();
  renameTimer = setTimeout(() => {
    if (!name) return;
    store.set('dgb:name', name);
    send({ type: 'rename', name });
  }, 450);
});

let alibiTimer = null;
function submitAlibi() {
  clearTimeout(alibiTimer);
  const alibi = $('#my-alibi').value.trim();
  store.set('dgb:alibi', alibi);
  send({ type: 'alibi', alibi });
}

$('#my-alibi').addEventListener('input', () => {
  clearTimeout(alibiTimer);
  alibiTimer = setTimeout(submitAlibi, 450);
});

// 엔터로 바로 확정 (한글 조합 중 엔터는 제외)
$('#my-alibi').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  submitAlibi();
  event.target.blur();
});

$('#photo-btn').addEventListener('click', () => $('#photo-file').click());

$('#photo-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await toPortraitJpeg(file);
    if (send({ type: 'photo', dataUrl })) toast('캠페인 모델로 위촉되셨습니다.');
  } catch {
    toast('사진을 읽지 못했습니다. 다른 사진으로 시도하세요.');
  }
});

// 가운데를 3:4 로 잘라 480x640 JPEG 로 줄인다 (서버 전송량 절약)
async function toPortraitJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const W = 480;
  const H = 640;
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const sw = W / scale;
  const sh = H / scale;
  const canvas = el('canvas', { width: W, height: H });
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, W, H);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.8);
}

$('#toggle-timer').addEventListener('click', () => {
  const mine = me();
  unlockAudio();
  if (mine) send({ type: 'timer', action: mine.runningSince ? 'stop' : 'start' });
});

$('#reset-timer').addEventListener('click', () => {
  const mine = me();
  if (!mine || elapsedOf(mine) === 0) return toast('인멸할 증거가 없습니다. (아직은)');
  if (confirm('누적 형량을 0으로 되돌립니다. 정말 증거를 인멸할까요?')) send({ type: 'timer', action: 'reset' });
});

$('#wanted-list').addEventListener('click', (event) => {
  const targetId = event.target.closest('[data-report]')?.dataset.report;
  if (targetId) send({ type: 'report', targetId });
});

// ---------- 방 헤더 ----------

$('#copy-link').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('초대 링크를 복사했습니다. 용의자에게 뿌리세요.');
  } catch {
    prompt('아래 링크를 복사하세요', link);
  }
});

$('#leave').addEventListener('click', () => {
  if (!confirm('방을 나가면 내 기록과 얼굴이 명단에서 지워집니다. 나갈까요?')) return;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }));
  goLobby();
});

if (noBackend) {
  showLobby();
  toast('서버 주소가 설정되지 않았습니다. config.js 를 확인하세요.', 8000);
} else {
  route();
}
