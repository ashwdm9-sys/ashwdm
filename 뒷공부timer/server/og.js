// 링크 미리보기(Open Graph) 이미지: 포스터 모델 얼굴의 눈에서 레이저가 나가는 사진 + 어그로 멘트
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'BlackHanSans-Regular.ttf'), 'BlackHan');
const FONT = 'BlackHan, sans-serif';

const W = 1200;
const H = 630;

// 번갈아 나오는 세 가지 멘트. lines 는 이미지 안에서 줄바꿈하는 방식
const PHRASES = [
  { text: '뒷공부 그만!', lines: ['뒷공부', '그만!'], size: 172 },
  { text: '공정한 경쟁에 참여해주세요.', lines: ['공정한 경쟁에', '참여해주세요.'], size: 112 },
  { text: '뒷공부는 비겁하다', lines: ['뒷공부는', '비겁하다'], size: 172 },
];

const EYES_GUESS = [
  { x: 0.37, y: 0.43 },
  { x: 0.63, y: 0.43 },
];

function laser(g, from, angle, length, k) {
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(from.x, from.y);
  g.lineTo(from.x + Math.cos(angle) * length, from.y + Math.sin(angle) * length);
  g.strokeStyle = 'rgba(255,40,0,0.45)';
  g.lineWidth = 46 * k;
  g.stroke();
  g.strokeStyle = 'rgba(255,170,0,0.75)';
  g.lineWidth = 22 * k;
  g.stroke();
  g.strokeStyle = '#fffbd0';
  g.lineWidth = 7 * k;
  g.stroke();
}

function glow(g, p, r) {
  g.globalCompositeOperation = 'lighter';
  const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, '#fff36b');
  grad.addColorStop(0.55, '#ff8a00');
  grad.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
}

function pill(g, text, x, y, size, fg, bg) {
  g.font = `${size}px ${FONT}`;
  const w = g.measureText(text).width + size * 1.1;
  const h = size * 1.5;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, x + size * 0.55, y + h / 2 + 2);
  return { w, h };
}

function fitText(g, text, size, maxWidth) {
  let s = size;
  g.font = `${s}px ${FONT}`;
  while (s > 40 && g.measureText(text).width > maxWidth) {
    s -= 4;
    g.font = `${s}px ${FONT}`;
  }
  return s;
}

/**
 * @param {object} opt
 * @param {number} opt.phraseIndex  0~2
 * @param {string} opt.roomName
 * @param {Buffer|null} opt.photo   JPEG 바이트 (없으면 빈 모델 실루엣)
 * @param {{x:number,y:number}[]|null} opt.eyes 사진 안의 눈 위치 (0~1 비율)
 */
async function renderOg({ phraseIndex = 0, roomName = '', photo = null, eyes = null }) {
  const phrase = PHRASES[((phraseIndex % PHRASES.length) + PHRASES.length) % PHRASES.length];
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');

  // 배경: 붉은 폭발
  const cx = 880;
  const cy = 320;
  const bg = g.createRadialGradient(cx, cy, 20, cx, cy, 760);
  bg.addColorStop(0, '#ff4a2a');
  bg.addColorStop(0.35, '#a81a10');
  bg.addColorStop(1, '#190504');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // 집중선
  g.save();
  g.translate(cx, cy);
  const rays = 28;
  for (let i = 0; i < rays; i += 2) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 1) / rays) * Math.PI * 2;
    g.fillStyle = 'rgba(255,230,120,0.10)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a0) * 1400, Math.sin(a0) * 1400);
    g.lineTo(Math.cos(a1) * 1400, Math.sin(a1) * 1400);
    g.closePath();
    g.fill();
  }
  g.restore();

  // 모델 얼굴 (위가 둥근 아치 모양)
  const fx = 720;
  const fy = 40;
  const fw = 420;
  const fh = 560;
  g.save();
  g.beginPath();
  g.moveTo(fx, fy + fh);
  g.lineTo(fx, fy + fw / 2);
  g.arc(fx + fw / 2, fy + fw / 2, fw / 2, Math.PI, 0);
  g.lineTo(fx + fw, fy + fh);
  g.closePath();
  g.shadowColor = 'rgba(255,200,60,0.9)';
  g.shadowBlur = 50;
  g.fillStyle = '#e9e5e2';
  g.fill();
  g.shadowBlur = 0;
  g.clip();
  if (photo) {
    try {
      const img = await loadImage(photo);
      const scale = Math.max(fw / img.width, fh / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      g.drawImage(img, fx + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh);
    } catch {
      photo = null;
    }
  }
  if (!photo) {
    g.fillStyle = '#cfc9c4';
    g.beginPath();
    g.arc(fx + fw / 2, fy + fh * 0.4, 90, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(fx + fw / 2, fy + fh + 20, 190, 210, 0, Math.PI, 0);
    g.fill();
  }
  g.restore();
  g.lineWidth = 10;
  g.strokeStyle = '#ffd23f';
  g.beginPath();
  g.moveTo(fx, fy + fh);
  g.lineTo(fx, fy + fw / 2);
  g.arc(fx + fw / 2, fy + fw / 2, fw / 2, Math.PI, 0);
  g.lineTo(fx + fw, fy + fh);
  g.stroke();

  // 눈에서 레이저: 왼쪽 눈은 왼쪽 위로, 오른쪽 눈은 오른쪽 위로
  const pts = (eyes && eyes.length === 2 ? eyes : EYES_GUESS).map((p) => ({ x: fx + p.x * fw, y: fy + p.y * fh }));
  [-Math.PI + 0.42, -0.42].forEach((angle, i) => {
    laser(g, pts[i], angle, 1500, 1);
  });
  // 얼굴 쪽으로도 짧게 한 줄씩 (눈이 번쩍이는 느낌)
  pts.forEach((p) => glow(g, p, 46));
  g.globalCompositeOperation = 'source-over';

  // 불꽃 점들
  for (let i = 0; i < 90; i++) {
    const p = pts[i % 2];
    const a = (i % 2 ? -0.42 : -Math.PI + 0.42) + (Math.sin(i * 12.9898) * 0.35);
    const d = 40 + ((Math.sin(i * 78.233) + 1) / 2) * 620;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = i % 3 ? 'rgba(255,200,60,0.8)' : 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2 + ((i * 7) % 5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // 캠페인 이름표
  pill(g, '뒷공부 근절 캠페인', 48, 40, 34, '#ffffff', '#111111');

  // 큰 멘트
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.lineJoin = 'round';
  const lineH = phrase.size * 0.98;
  const top = 300 - ((phrase.lines.length - 1) * lineH) / 2 + phrase.size * 0.34;
  phrase.lines.forEach((line, i) => {
    const size = fitText(g, line, phrase.size, 640);
    g.font = `${size}px ${FONT}`;
    const y = top + i * lineH;
    g.lineWidth = Math.max(14, size * 0.12);
    g.strokeStyle = '#111111';
    g.strokeText(line, 54 + 7, y + 7);
    g.strokeText(line, 54, y);
    g.fillStyle = i === phrase.lines.length - 1 ? '#ffe600' : '#ffffff';
    g.fillText(line, 54, y);
  });

  // 방 이름 + 안내
  const name = String(roomName || '').trim().slice(0, 18);
  if (name) {
    const s = fitText(g, `"${name}" 방`, 44, 560);
    pill(g, `"${name}" 방`, 48, 482, s, '#111111', '#ffe600');
  }
  pill(g, '지금 입장해서 서로 감시하기', 48, 548, 34, '#ffffff', '#d1291c');

  return canvas.encode('png');
}

module.exports = { renderOg, PHRASES };
