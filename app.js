// get a Grip! — 하나의 items 배열을 Monthly / Weekly / Daily 세 화면이 같이 본다.
// item: { id, title, date:'YYYY-MM-DD', start:'HH:MM'|null, end:'HH:MM'|null, done, color, created }
// start가 있으면 Weekly 시간표에 블록으로, 없으면 Daily 체크리스트에만 나온다.

const STORE_KEY = 'grip.items.v1';
const VIEW_KEY = 'grip.view';
const HOUR_H = 56; // style.css의 --hour-h와 같아야 함
const SNAP = 30;
const COLORS = ['#1b2a4e', '#4a5d8f', '#7a6fa8', '#4f8383', '#a8677f', '#96733a'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const $ = (id) => document.getElementById(id);
const viewEl = $('view');
const modal = $('modal');

/* ---------- date helpers ---------- */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -d.getDay());
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => { const m = Math.min(min, 24 * 60 - 1); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const timeLabel = (it) => (it.start ? `${it.start}–${it.end}` : '');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- state ---------- */

let items = load();
let view = read(VIEW_KEY) || 'monthly';
let cursor = today();
let miniMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
let weekScroll = null;
let editingId = null;

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경에서는 메모리로만 동작 */ }
}

function load() {
  const raw = read(STORE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  // 첫 실행: 연동이 어떻게 보이는지 알 수 있게 예시 몇 개
  const t = today();
  const mk = (offset, title, start, end, color) => ({
    id: uid(), title, date: ymd(addDays(t, offset)),
    start: start || null, end: end || null, done: false, color: COLORS[color], created: Date.now() + offset,
  });
  return [
    mk(0, '심층신경망 수업 듣기', '10:00', '12:00', 0),
    mk(0, '과제 제출하기', null, null, 2),
    mk(1, '팀 프로젝트 회의', '14:00', '15:30', 1),
    mk(3, '운동', '09:00', '10:00', 3),
  ];
}

function save() {
  write(STORE_KEY, JSON.stringify(items));
}

const byTime = (a, b) =>
  (a.start ? 0 : 1) - (b.start ? 0 : 1) || (a.start || '').localeCompare(b.start || '') || a.created - b.created;

const itemsOn = (ds) => items.filter((it) => it.date === ds).sort(byTime);

function setCursor(d) {
  cursor = d;
  miniMonth = new Date(d.getFullYear(), d.getMonth(), 1);
}

function setView(v) {
  view = v;
  write(VIEW_KEY, v);
}

/* ---------- render ---------- */

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('title').textContent = titleText();
  renderMini();
  renderUpcoming();
  if (view === 'monthly') renderMonthly();
  else if (view === 'weekly') renderWeekly();
  else {
    const top = viewEl.querySelector('.day')?.scrollTop || 0;
    renderDaily();
    viewEl.querySelector('.day').scrollTop = top;
  }
}

function titleText() {
  const y = cursor.getFullYear();
  if (view === 'monthly') return `${MONTHS[cursor.getMonth()]} ${y}`;
  if (view === 'daily') return `${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${DOW_LONG[cursor.getDay()]}`;
  const s = startOfWeek(cursor);
  const e = addDays(s, 6);
  const sm = MONTHS[s.getMonth()].slice(0, 3);
  const em = MONTHS[e.getMonth()].slice(0, 3);
  return `${sm} ${s.getDate()} – ${sm === em ? '' : em + ' '}${e.getDate()}, ${e.getFullYear()}`;
}

function renderMini() {
  $('miniTitle').textContent = `${MONTHS[miniMonth.getMonth()]} ${miniMonth.getFullYear()}`;
  const start = startOfWeek(miniMonth);
  const todayStr = ymd(today());
  const cursorStr = ymd(cursor);
  const cursorWeek = ymd(startOfWeek(cursor));
  const hasItems = new Set(items.map((it) => it.date));

  let html = `<div class="mini-row dow">${DOW.map((d) => `<span>${d[0]}</span>`).join('')}</div>`;
  for (let w = 0; w < 6; w++) {
    const ws = addDays(start, w * 7);
    if (w > 0 && ws.getMonth() !== miniMonth.getMonth()) break;
    const rowSel = view === 'weekly' && ymd(ws) === cursorWeek;
    html += `<div class="mini-row${rowSel ? ' sel' : ''}">`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const ds = ymd(d);
      const cls = [
        'mini-day',
        d.getMonth() !== miniMonth.getMonth() && 'other',
        ds === todayStr && 'today',
        view === 'daily' && ds === cursorStr && 'sel',
        hasItems.has(ds) && 'has',
      ].filter(Boolean).join(' ');
      html += `<button type="button" class="${cls}" data-date="${ds}">${d.getDate()}</button>`;
    }
    html += '</div>';
  }
  $('miniGrid').innerHTML = html;
}

function renderUpcoming() {
  const todayStr = ymd(today());
  const list = items
    .filter((it) => !it.done && it.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))
    .slice(0, 6);
  $('upcoming').innerHTML = list.length
    ? list.map((it) => {
        const d = parseYmd(it.date);
        const when = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()} (${DOW[d.getDay()]})${it.start ? ' · ' + it.start : ''}`;
        return `<li><button type="button" data-date="${it.date}" style="--c:${it.color}"><span class="t">${esc(it.title)}</span><small>${when}</small></button></li>`;
      }).join('')
    : '<li class="none">예정된 일정이 없어요</li>';
}

function renderMonthly() {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const start = startOfWeek(first);
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const todayStr = ymd(today());
  const MAX = 3;

  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const list = itemsOn(ds);
    const cls = ['month-cell', d.getMonth() !== m && 'other', ds === todayStr && 'today'].filter(Boolean).join(' ');
    const chips = list.slice(0, MAX).map((it) =>
      `<button type="button" class="chip${it.done ? ' done' : ''}" data-edit="${it.id}" style="--c:${it.color}" title="${esc(`${timeLabel(it)} ${it.title}`.trim())}">${it.start ? `<b>${it.start}</b>` : ''}${esc(it.title)}</button>`
    ).join('');
    const more = list.length > MAX ? `<span class="more">+${list.length - MAX}개 더</span>` : '';
    cells += `<div class="${cls}" data-day="${ds}"><span class="num">${d.getDate()}</span>${chips}${more}</div>`;
  }

  viewEl.innerHTML = `
    <div class="month">
      <div class="month-dow">${DOW.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="month-grid" style="grid-template-rows:repeat(${weeks},1fr)">${cells}</div>
    </div>`;
}

// 겹치는 일정은 나란히 놓는다: 서로 이어져 겹치는 묶음(cluster)마다 열을 나눠 배치
function layoutDay(list) {
  const evs = list.map((it) => {
    const s = toMin(it.start);
    return { it, s, e: Math.max(toMin(it.end), s + 15) };
  }).sort((a, b) => a.s - b.s || b.e - a.e);

  let cluster = [];
  let clusterEnd = -1;
  let cols = [];
  const flush = () => { cluster.forEach((ev) => { ev.n = cols.length; }); cluster = []; cols = []; };

  for (const ev of evs) {
    if (cluster.length && ev.s >= clusterEnd) flush();
    let c = cols.findIndex((end) => end <= ev.s);
    if (c === -1) c = cols.length;
    cols[c] = ev.e;
    ev.col = c;
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  }
  flush();
  return evs;
}

function renderWeekly() {
  const ws = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const todayStr = ymd(today());
  const now = new Date();

  const head = days.map((d) => {
    const ds = ymd(d);
    return `<button type="button" class="wk-day${ds === todayStr ? ' today' : ''}" data-day="${ds}" title="Daily로 보기"><span class="num">${d.getDate()}</span><span class="dow">${DOW[d.getDay()]}</span></button>`;
  }).join('');

  const allday = days.map((d) => {
    const chips = itemsOn(ymd(d)).filter((it) => !it.start).map((it) =>
      `<button type="button" class="chip${it.done ? ' done' : ''}" data-edit="${it.id}" style="--c:${it.color}">${esc(it.title)}</button>`
    ).join('');
    return `<div class="cell">${chips}</div>`;
  }).join('');

  const hours = Array.from({ length: 24 }, (_, h) => `<div><span>${pad(h)}:00</span></div>`).join('');

  const cols = days.map((d) => {
    const ds = ymd(d);
    const evs = layoutDay(itemsOn(ds).filter((it) => it.start)).map(({ it, s, e, col, n }) => {
      const top = (s / 60) * HOUR_H;
      const height = Math.max(((e - s) / 60) * HOUR_H - 2, 20);
      const style = `top:${top + 1}px;height:${height}px;left:calc(${(col / n) * 100}% + 2px);width:calc(${100 / n}% - 4px);--c:${it.color}`;
      const tm = height >= 40 ? `<span class="tm">${timeLabel(it)}</span>` : '';
      return `<button type="button" class="wk-ev${it.done ? ' done' : ''}" data-edit="${it.id}" style="${style}" title="${esc(`${timeLabel(it)} ${it.title}`)}"><span class="t">${esc(it.title)}</span>${tm}</button>`;
    }).join('');
    const nowLine = ds === todayStr
      ? `<div class="wk-now" style="top:${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H}px"></div>`
      : '';
    return `<div class="wk-col${ds === todayStr ? ' today' : ''}" data-date="${ds}">${evs}${nowLine}</div>`;
  }).join('');

  viewEl.innerHTML = `
    <div class="week" id="week">
      <div class="wk-sticky">
        <div class="wk-head"><span></span>${head}</div>
        <div class="wk-allday"><span class="label">할 일</span>${allday}</div>
      </div>
      <div class="wk-grid"><div class="wk-hours">${hours}</div>${cols}</div>
    </div>`;

  const week = $('week');
  week.scrollTop = weekScroll ?? 8 * HOUR_H;
  week.addEventListener('scroll', () => { weekScroll = week.scrollTop; });
}

function renderDaily() {
  const ds = ymd(cursor);
  const list = itemsOn(ds);
  const done = list.filter((it) => it.done).length;
  const todayStr = ymd(today());
  const ws = startOfWeek(cursor);

  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const s = ymd(d);
    const dayList = itemsOn(s);
    const left = dayList.filter((it) => !it.done).length;
    const cnt = !dayList.length
      ? '<span class="cnt zero">0</span>'
      : left ? `<span class="cnt">${left}</span>` : '<span class="cnt all">✓</span>';
    const cls = [s === ds && 'sel', s === todayStr && 'today'].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-day="${s}"><span class="dow">${DOW[d.getDay()]}</span><span class="num">${d.getDate()}</span>${cnt}</button>`;
  }).join('');

  const row = (it) => `
    <li class="todo${it.done ? ' done' : ''}" style="--c:${it.color}">
      <button type="button" class="check" data-toggle="${it.id}" role="checkbox" aria-checked="${it.done}" aria-label="${esc(it.title)} 완료"></button>
      <button type="button" class="todo-body" data-edit="${it.id}">${it.start ? `<span class="tm">${timeLabel(it)}</span>` : ''}<span class="t">${esc(it.title)}</span></button>
      <button type="button" class="del" data-del="${it.id}" aria-label="삭제">×</button>
    </li>`;
  const group = (name, rows) => (rows.length ? `<section class="todo-group"><h3>${name}</h3><ul>${rows.map(row).join('')}</ul></section>` : '');

  const timed = list.filter((it) => it.start);
  const untimed = list.filter((it) => !it.start);

  viewEl.innerHTML = `
    <div class="day">
      <div class="day-inner">
        <div class="day-strip">${strip}</div>
        <div class="progress">
          <div class="progress-text"><strong>${ds === todayStr ? '오늘의 체크리스트' : '체크리스트'}</strong><span>${done} / ${list.length} 완료</span></div>
          <div class="progress-bar"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div>
        </div>
        <form class="quick" id="quick">
          <input class="q-title" id="qTitle" type="text" placeholder="할 일 추가 (시간을 넣으면 Weekly 시간표에도 표시돼요)" maxlength="60" autocomplete="off">
          <input class="q-time" id="qStart" type="time" step="300" aria-label="시작 시간">
          <span class="sep">–</span>
          <input class="q-time" id="qEnd" type="time" step="300" aria-label="종료 시간">
          <button type="submit" class="btn primary">추가</button>
        </form>
        ${group('시간표 일정', timed)}
        ${group('할 일', untimed)}
        ${list.length ? '' : '<p class="empty">아직 할 일이 없어요. 위에서 추가해 보세요.</p>'}
      </div>
    </div>`;
}

/* ---------- item actions ---------- */

function addItem({ title, date, start, end, color }) {
  items.push({
    id: uid(), title, date,
    start: start || null, end: start ? end : null,
    done: false, color: color || COLORS[0], created: Date.now(),
  });
  save();
}

function removeItem(id) {
  items = items.filter((it) => it.id !== id);
  save();
}

/* ---------- modal ---------- */

$('fColors').innerHTML = COLORS.map((c) =>
  `<label><input type="radio" name="color" value="${c}"><i style="--c:${c}"></i></label>`
).join('');

function syncTimed() {
  const on = $('fTimed').checked;
  $('fStart').disabled = !on;
  $('fEnd').disabled = !on;
  if (on && !$('fStart').value) {
    $('fStart').value = '10:00';
    $('fEnd').value = '11:00';
  }
}

function openModal(init = {}, id = null) {
  editingId = id;
  $('modalTitle').textContent = id ? '일정 수정' : '일정 추가';
  $('fTitle').value = init.title || '';
  $('fDate').value = init.date || ymd(cursor);
  $('fTimed').checked = !!init.start;
  $('fStart').value = init.start || '';
  $('fEnd').value = init.end || '';
  const color = init.color || COLORS[0];
  document.querySelectorAll('#fColors input').forEach((r) => { r.checked = r.value === color; });
  $('fDelete').hidden = !id;
  $('fError').hidden = true;
  syncTimed();
  modal.showModal();
  $('fTitle').focus();
}

$('fTimed').addEventListener('change', syncTimed);
$('fCancel').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

$('fDelete').addEventListener('click', () => {
  removeItem(editingId);
  modal.close();
  render();
});

$('modalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fail = (msg) => { $('fError').textContent = msg; $('fError').hidden = false; };
  const title = $('fTitle').value.trim();
  const date = $('fDate').value;
  const timed = $('fTimed').checked;
  const start = timed ? $('fStart').value : null;
  const end = timed ? $('fEnd').value : null;
  const color = document.querySelector('#fColors input:checked').value;

  if (!title) return fail('제목을 입력해 주세요.');
  if (!date) return fail('날짜를 선택해 주세요.');
  if (timed && (!start || !end)) return fail('시작과 종료 시간을 모두 입력해 주세요.');
  if (timed && toMin(end) <= toMin(start)) return fail('종료 시간은 시작 시간보다 늦어야 해요.');

  if (editingId) {
    Object.assign(items.find((it) => it.id === editingId), { title, date, start, end, color });
    save();
  } else {
    addItem({ title, date, start, end, color });
  }
  modal.close();
  render();
});

/* ---------- main view events ---------- */

viewEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle],[data-del],[data-edit],[data-day]');
  if (!t) return;
  const { toggle, del, edit, day } = t.dataset;
  if (toggle) {
    const it = items.find((x) => x.id === toggle);
    it.done = !it.done;
    save();
  } else if (del) {
    const it = items.find((x) => x.id === del);
    if (!confirm(`"${it.title}" 을(를) 삭제할까요?`)) return;
    removeItem(del);
  } else if (edit) {
    openModal(items.find((x) => x.id === edit), edit);
    return;
  } else if (day) {
    setCursor(parseYmd(day));
    setView('daily');
  }
  render();
});

viewEl.addEventListener('submit', (e) => {
  if (e.target.id !== 'quick') return;
  e.preventDefault();
  const title = $('qTitle').value.trim();
  if (!title) { $('qTitle').focus(); return; }
  const start = $('qStart').value;
  let end = $('qEnd').value;
  if (start && (!end || toMin(end) <= toMin(start))) end = toHHMM(toMin(start) + 60);
  addItem({ title, date: ymd(cursor), start, end });
  render();
  $('qTitle').focus();
});

// Weekly: 빈 칸을 클릭하거나 드래그해서 시간 범위를 잡으면 추가 창이 열린다
viewEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const col = e.target.closest('.wk-col');
  if (!col || e.target.closest('.wk-ev')) return;
  e.preventDefault();

  const minAt = (ev) => ((ev.clientY - col.getBoundingClientRect().top) / HOUR_H) * 60;
  const anchor = Math.max(0, Math.min(1440 - SNAP, Math.floor(minAt(e) / SNAP) * SNAP));
  let s = anchor;
  let en = anchor + SNAP;
  let moved = false;

  const ghost = document.createElement('div');
  ghost.className = 'wk-ghost';
  col.appendChild(ghost);
  const paint = () => {
    ghost.style.top = `${(s / 60) * HOUR_H}px`;
    ghost.style.height = `${((en - s) / 60) * HOUR_H}px`;
    ghost.textContent = `${toHHMM(s)}–${toHHMM(en)}`;
  };
  paint();

  const onMove = (ev) => {
    const cur = Math.max(0, Math.min(1440, Math.round(minAt(ev) / SNAP) * SNAP));
    if (cur !== anchor) moved = true;
    s = Math.min(anchor, cur);
    en = Math.max(anchor + SNAP, cur);
    if (cur < anchor) en = anchor + SNAP;
    paint();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    ghost.remove();
    if (!moved) en = Math.min(s + 60, 1440);
    openModal({ date: col.dataset.date, start: toHHMM(s), end: toHHMM(en) });
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

/* ---------- chrome events ---------- */

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  setView(b.dataset.view);
  render();
});

function step(dir) {
  if (view === 'monthly') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  else setCursor(addDays(cursor, dir * (view === 'weekly' ? 7 : 1)));
  render();
}
$('prevBtn').addEventListener('click', () => step(-1));
$('nextBtn').addEventListener('click', () => step(1));
$('todayBtn').addEventListener('click', () => { setCursor(today()); weekScroll = null; render(); });
$('addBtn').addEventListener('click', () => openModal());

$('miniPrev').addEventListener('click', () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1); renderMini(); });
$('miniNext').addEventListener('click', () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1); renderMini(); });
$('miniGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (!b) return;
  setCursor(parseYmd(b.dataset.date));
  render();
});

$('upcoming').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (!b) return;
  setCursor(parseYmd(b.dataset.date));
  setView('daily');
  render();
});

/* ---------- search ---------- */

const searchEl = $('search');
const resultsEl = $('searchResults');

function renderSearch() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { resultsEl.hidden = true; return; }
  const hits = items
    .filter((it) => it.title.toLowerCase().includes(q))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))
    .slice(0, 8);
  resultsEl.innerHTML = hits.length
    ? hits.map((it) => `<li><button type="button" data-date="${it.date}">${esc(it.title)}<small>${it.date}${it.start ? ' · ' + timeLabel(it) : ''}</small></button></li>`).join('')
    : '<li class="none">검색 결과가 없어요</li>';
  resultsEl.hidden = false;
}

searchEl.addEventListener('input', renderSearch);
searchEl.addEventListener('focus', renderSearch);
searchEl.addEventListener('blur', () => { resultsEl.hidden = true; });
searchEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') searchEl.blur(); });
// blur보다 먼저 처리되도록 mousedown에서 이동
resultsEl.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const b = e.target.closest('[data-date]');
  if (!b) return;
  setCursor(parseYmd(b.dataset.date));
  setView('daily');
  searchEl.value = '';
  searchEl.blur();
  render();
});

save();
render();
