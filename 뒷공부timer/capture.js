// 이미지로 저장하기: 랭킹 / 검거 인증샷 / 포스터를 캔버스에 직접 그려서 PNG 로 만든다.
// (화면을 그대로 찍는 방식은 이 사이트의 CSS 효과를 정확히 못 따라가서, 저장용으로 따로 그린다)

const FONT_D = '"Black Han Sans", "Noto Sans KR", sans-serif';
const FONT_B = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const FONT_M = '"JetBrains Mono", ui-monospace, Consolas, monospace';
const RED = '#d14236';

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('40px "Black Han Sans"'),
      document.fonts.load('500 30px "Noto Sans KR"'),
      document.fonts.load('700 30px "Noto Sans KR"'),
      document.fonts.load('800 30px "JetBrains Mono"'),
    ]);
  } catch {
    // 폰트를 못 불러와도 대체 폰트로 그린다
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const svgImage = (svg) => loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));

function newCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, g: canvas.getContext('2d') };
}

function textStroke(g, text, x, y, fill, stroke, width) {
  g.lineJoin = 'round';
  g.lineWidth = width;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function fit(g, text, font, size, maxWidth) {
  let s = size;
  g.font = font(s);
  while (s > 18 && g.measureText(text).width > maxWidth) {
    s -= 2;
    g.font = font(s);
  }
  return s;
}

function pill(g, text, x, y, size, fg, bg, align = 'left') {
  g.font = `${size}px ${FONT_D}`;
  const w = g.measureText(text).width + size * 1.2;
  const h = size * 1.55;
  const left = align === 'center' ? x - w / 2 : x;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(left, y, w, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, left + size * 0.6, y + h / 2 + 2);
  return { w, h };
}

function watermark(g, W, H, color = 'rgba(255,255,255,0.85)') {
  g.font = `700 28px ${FONT_B}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('뒷공부 근절 캠페인 · dwitgongbu.party', W / 2, H - 36);
}

function circleAvatar(g, img, name, cx, cy, r, ring) {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.closePath();
  g.fillStyle = '#e7e2e0';
  g.fill();
  if (img) {
    g.clip();
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    g.drawImage(img, cx - w / 2, cy - h / 2 - h * 0.04, w, h);
  }
  g.restore();
  if (!img) {
    g.fillStyle = '#8d8782';
    g.font = `${r}px ${FONT_D}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText([...String(name || '?')][0] || '?', cx, cy + 3);
  }
  if (ring) {
    g.lineWidth = 6;
    g.strokeStyle = ring;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
}

const DAY = ['일', '월', '화', '수', '목', '금', '토'];
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} (${DAY[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 랭킹 ----------

const MEDAL_STYLE = {
  1: { bg: ['#fff0a8', '#ffc400'], line: '#e0a800', icon: '👑', tag: '#111' },
  2: { bg: ['#f4f7fa', '#b8c2cf'], line: '#8f9bab', icon: '🥈', tag: '#111' },
  3: { bg: ['#ffe3c6', '#c27d3e'], line: '#a8672a', icon: '🥉', tag: '#111' },
};

/**
 * entries: [{ rank, medal(0~3), name, isMe, tag, time, photo }]
 */
export async function renderRanking({ roomName, entries }) {
  await loadFonts();
  const imgs = await Promise.all(entries.map((e) => loadImage(e.photo)));
  const W = 1080;
  const rowH = 128;
  const top = 380;
  const H = top + Math.max(entries.length, 1) * rowH + 200;
  const { canvas, g } = newCanvas(W, H);

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#d1291c');
  bg.addColorStop(0.55, '#7d1410');
  bg.addColorStop(1, '#190504');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, 200);
  for (let i = 0; i < 30; i += 2) {
    const a0 = (i / 30) * Math.PI * 2;
    const a1 = ((i + 1) / 30) * Math.PI * 2;
    g.fillStyle = 'rgba(255,230,120,0.08)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a0) * 2200, Math.sin(a0) * 2200);
    g.lineTo(Math.cos(a1) * 2200, Math.sin(a1) * 2200);
    g.closePath();
    g.fill();
  }
  g.restore();

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `120px ${FONT_D}`;
  textStroke(g, '뒷공부 랭킹', W / 2, 190, '#ffffff', '#111', 22);
  g.font = `46px ${FONT_D}`;
  textStroke(g, '가장 많이 몰래 공부한 배신자는?', W / 2, 262, '#ffe600', '#111', 12);
  pill(g, `"${String(roomName || '').slice(0, 16)}" 방`, W / 2, 296, 36, '#111', '#ffe600', 'center');

  if (!entries.length) {
    g.font = `48px ${FONT_D}`;
    textStroke(g, '아직 아무도 없습니다', W / 2, top + 100, '#fff', '#111', 10);
  }

  entries.forEach((e, i) => {
    const y = top + i * rowH;
    const x = 48;
    const w = W - 96;
    const h = rowH - 16;
    const m = MEDAL_STYLE[e.medal];
    g.save();
    if (m) {
      const gr = g.createLinearGradient(x, y, x + w, y);
      gr.addColorStop(0, m.bg[0]);
      gr.addColorStop(0.5, '#ffffff');
      gr.addColorStop(1, m.bg[1]);
      g.shadowColor = m.line;
      g.shadowBlur = e.medal === 1 ? 40 : 18;
      g.fillStyle = gr;
    } else {
      g.fillStyle = 'rgba(255,255,255,0.92)';
    }
    g.beginPath();
    g.roundRect(x, y, w, h, 28);
    g.fill();
    g.restore();
    if (m) {
      g.lineWidth = 6;
      g.strokeStyle = m.line;
      g.beginPath();
      g.roundRect(x, y, w, h, 28);
      g.stroke();
    }

    g.textBaseline = 'middle';
    g.textAlign = 'center';
    if (m) {
      g.font = `56px ${FONT_B}`;
      g.fillStyle = '#111';
      g.fillText(m.icon, x + 50, y + h / 2 + 4);
    } else {
      g.font = `44px ${FONT_D}`;
      g.fillStyle = RED;
      g.fillText(String(e.rank), x + 50, y + h / 2 + 3);
    }
    circleAvatar(g, imgs[i], e.name, x + 150, y + h / 2, 42, m ? m.line : null);

    g.textAlign = 'left';
    const nameFont = (s) => `${s}px ${FONT_D}`;
    const label = e.isMe ? `${e.name} (나)` : e.name;
    const size = fit(g, label, nameFont, 44, 360);
    g.font = nameFont(size);
    g.fillStyle = '#111';
    g.fillText(label, x + 214, y + h / 2 - 16);
    if (e.tag) {
      g.font = `700 26px ${FONT_B}`;
      g.fillStyle = e.medal ? '#111' : '#5f5f5f';
      g.fillText(e.tag, x + 214, y + h / 2 + 24);
    }
    g.textAlign = 'right';
    g.font = `800 46px ${FONT_M}`;
    g.fillStyle = '#111';
    g.fillText(e.time, x + w - 28, y + h / 2 + 3);
  });

  watermark(g, W, H);
  g.font = `700 26px ${FONT_B}`;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.textAlign = 'center';
  g.fillText(stamp(), W / 2, H - 84);
  return canvas;
}

// ---------- 검거 인증샷 ----------

export async function renderBusted({ name, photo, convictions, by, roomName }) {
  await loadFonts();
  const img = await loadImage(photo);
  const W = 1080;
  const H = 1350;
  const { canvas, g } = newCanvas(W, H);

  const bg = g.createRadialGradient(W / 2, 640, 40, W / 2, 640, 900);
  bg.addColorStop(0, '#ff4a2a');
  bg.addColorStop(0.5, '#a81a10');
  bg.addColorStop(1, '#190504');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, 640);
  for (let i = 0; i < 36; i += 2) {
    const a0 = (i / 36) * Math.PI * 2;
    const a1 = ((i + 1) / 36) * Math.PI * 2;
    g.fillStyle = 'rgba(255,230,120,0.12)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a0) * 1600, Math.sin(a0) * 1600);
    g.lineTo(Math.cos(a1) * 1600, Math.sin(a1) * 1600);
    g.closePath();
    g.fill();
  }
  g.restore();

  // 노란 접근금지 띠
  [0, H - 70].forEach((y) => {
    g.save();
    g.beginPath();
    g.rect(0, y, W, 70);
    g.clip();
    g.fillStyle = '#ffd400';
    g.fillRect(0, y, W, 70);
    g.fillStyle = '#111';
    for (let x = -120; x < W + 120; x += 100) {
      g.beginPath();
      g.moveTo(x, y + 70);
      g.lineTo(x + 50, y + 70);
      g.lineTo(x + 120, y);
      g.lineTo(x + 70, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  });

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `110px ${FONT_B}`;
  g.fillText('🚨', W / 2, 250);
  g.font = `330px ${FONT_D}`;
  textStroke(g, '검거!', W / 2, 520, '#ffffff', '#111', 44);
  g.font = `150px ${FONT_D}`;
  textStroke(g, `전과 ${convictions}범`, W / 2, 690, '#ffe600', '#111', 30);

  circleAvatar(g, img, name, W / 2, 880, 150, '#ffe600');
  g.font = `76px ${FONT_D}`;
  textStroke(g, String(name || ''), W / 2, 1090, '#ffffff', '#111', 16);
  g.font = `700 38px ${FONT_B}`;
  g.fillStyle = '#ffffff';
  g.fillText(`${by}의 고발로 뒷공부가 적발됐습니다`, W / 2, 1148);
  pill(g, `"${String(roomName || '').slice(0, 16)}" 방 · ${stamp()}`, W / 2, 1170, 30, '#111', '#ffffff', 'center');
  watermark(g, W, H - 56);
  return canvas;
}

// ---------- 포스터 ----------

/**
 * model: { photo, name } | null
 * signSymbol: <symbol id="no-study"> 요소, handEl: .poster-hand 요소
 */
export async function renderPoster({ model, signSymbol, handEl }) {
  await loadFonts();
  const W = 1000;
  const H = 1400;
  const { canvas, g } = newCanvas(W, H);

  const handSvg = handEl.cloneNode(true);
  handSvg.removeAttribute('class');
  handSvg.removeAttribute('style');
  handSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  handSvg.setAttribute('width', '360');
  handSvg.setAttribute('height', '554');
  const signSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="270" height="270">${signSymbol.innerHTML}</svg>`;
  const [photoImg, handImg, signImg] = await Promise.all([
    loadImage(model?.photo),
    svgImage(new XMLSerializer().serializeToString(handSvg)),
    svgImage(signSvg),
  ]);

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = RED;
  g.fillRect(0, 0, W, 32);
  g.fillStyle = '#111';
  g.fillRect(0, 0, 90, 32);

  // 제목 + 금지 표지
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `170px ${FONT_D}`;
  const w1 = g.measureText('뒷공부').width;
  g.font = `104px ${FONT_D}`;
  const w2 = g.measureText('근절 캠페인').width;
  const titleW = Math.max(w1, w2);
  const total = titleW + 40 + 270;
  const startX = (W - total) / 2;
  const blockTop = 100;
  g.font = `170px ${FONT_D}`;
  g.fillStyle = RED;
  g.fillText('뒷공부', startX + (titleW - w1) / 2, blockTop + 150);
  g.font = `104px ${FONT_D}`;
  g.fillStyle = '#111';
  g.fillText('근절 캠페인', startX + (titleW - w2) / 2, blockTop + 250);
  if (signImg) g.drawImage(signImg, startX + titleW + 40, blockTop - 4, 270, 270);

  // 모델 (위가 둥근 아치)
  const mx = W - 30 - 530;
  const my = H - 700;
  const mw = 530;
  const mh = 700;
  const rx = mw / 2;
  const ry = mh * 0.38;
  g.save();
  g.beginPath();
  g.moveTo(mx, my + mh);
  g.lineTo(mx, my + ry);
  g.ellipse(mx + rx, my + ry, rx, ry, 0, Math.PI, 0);
  g.lineTo(mx + mw, my + mh);
  g.closePath();
  g.fillStyle = '#e9e5e2';
  g.fill();
  g.clip();
  if (photoImg) {
    const scale = Math.max(mw / photoImg.width, mh / photoImg.height);
    const dw = photoImg.width * scale;
    const dh = photoImg.height * scale;
    g.drawImage(photoImg, mx + (mw - dw) / 2, my + (mh - dh) / 2, dw, dh);
  } else {
    g.fillStyle = '#cfc9c4';
    g.beginPath();
    g.arc(mx + mw / 2, my + mh * 0.42, 100, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(mx + mw / 2, my + mh + 40, 230, 250, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#8d8782';
    g.font = `44px ${FONT_D}`;
    g.textAlign = 'center';
    g.fillText('모델 공석', mx + mw / 2, my + mh * 0.78);
    g.font = `500 28px ${FONT_B}`;
    g.fillText('얼굴을 헌납할 시민을 찾습니다', mx + mw / 2, my + mh * 0.78 + 46);
  }
  g.restore();
  if (model?.name) {
    g.font = `26px ${FONT_D}`;
    const label = `캠페인 모델 ${model.name}`;
    const w = g.measureText(label).width + 40;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.roundRect(mx + mw - w - 50, H - 510 - 52, w, 52, 26);
    g.fill();
    g.fillStyle = '#444';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, mx + mw - w - 30, H - 510 - 52 + 28);
  }

  // 규칙
  const rules = [
    [['같이 놀았으면서 ', 0], ['몰래 공부하기', 1], [' 금지', 0]],
    [['모두의 행복을 위한 ', 0], ['소중한 노력', 1]],
    [['공정한 경쟁', 1], ['에 참여해주세요', 0]],
  ];
  let y = 470;
  const size = 50;
  const maxW = 740;
  const left = 70;
  rules.forEach((segments) => {
    // 공백 기준으로 단어를 나누되 색 정보를 유지하며 줄바꿈
    const words = [];
    segments.forEach(([text, red]) => {
      text.split(/(?<= )/).forEach((part) => part && words.push({ part, red }));
    });
    let x = left + 30;
    g.fillStyle = '#111';
    g.font = `500 ${size}px ${FONT_B}`;
    g.fillText('•', left, y);
    words.forEach(({ part, red }) => {
      g.font = `${red ? 700 : 500} ${size}px ${FONT_B}`;
      const w = g.measureText(part).width;
      if (x + g.measureText(part.trimEnd()).width > left + maxW && x > left + 30) {
        x = left + 30;
        y += size * 1.3;
      }
      g.fillStyle = red ? RED : '#111';
      g.fillText(part, x, y);
      x += w;
    });
    y += size * 1.3 + 32;
  });

  // 손
  if (handImg) {
    g.save();
    g.translate(40 + 180, H + 60 - 277);
    g.rotate((-6 * Math.PI) / 180);
    g.drawImage(handImg, -180, -277, 360, 554);
    g.restore();
  }

  g.fillStyle = RED;
  g.fillRect(0, H - 14, W, 14);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.font = `700 24px ${FONT_B}`;
  g.fillStyle = 'rgba(17,17,17,0.55)';
  g.fillText('dwitgongbu.party', 36, 80);
  return canvas;
}

// ---------- 저장 ----------

export const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/** 모바일에서는 공유창(갤러리에 저장 포함), 그 외에는 파일 다운로드 */
export async function saveBlob(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '뒷공부 근절 캠페인' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancel';
      // 공유가 막히면 아래 다운로드로 넘어간다
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
