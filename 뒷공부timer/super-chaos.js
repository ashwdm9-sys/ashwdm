/*!
 * super-chaos.js — "슈퍼난장판" 5초 화면 폭주 효과 (의존성 없음, 단일 파일)
 *
 * 사용법
 *   <script src="super-chaos.js"></script>
 *   SuperChaos.prepare(imgEl);                 // (선택) 얼굴 사진이 바뀔 때 미리 눈 위치 인식
 *   SuperChaos.run({ image: imgEl, nick: "철수" });  // 버튼 클릭 핸들러 안에서 호출해야 소리가 남
 *
 * run(options)
 *   image     HTMLImageElement  눈에서 불을 쏠 얼굴 사진. 없으면 😡 이모지 머리로 대체
 *   nick      string            "OO님의 슈퍼난장판" 표시용
 *   duration  number            기본 5000ms
 *   sound     boolean           팡파레+에어혼 (기본 true)
 *   voice     boolean           음성 읽기 (기본 true)
 *   onEnd     function          끝나고 호출
 *
 * 얼굴 인식: 브라우저 FaceDetector → @vladmandic/face-api(CDN) → 실패 시 추정 위치 순으로 시도.
 */
(function (global) {
  "use strict";

  const SPAM = ["니혼자 공부하냐 ㅋ", "니혼자 공부하냐 ㅋㅋ", "니 혼자 공부하냐??? ㅋ", "혼자 공부하냐 ㅋ", "책 덮어 ㅋㅋㅋ", "뒷공부 적발 ㅋ", "배신자 ㅋㅋㅋㅋ", "공부 금지!!!", "형광펜 압수 ㅋ", "치사 ㅋ", "개치사", "앞공부해", "앞공부해!!!", "치사하게 뒷공부?", "개치사 ㅋㅋㅋ"];
  const HEAD_MENTS = ["치사", "개치사", "앞공부해", "앞공부해!!", "니혼자 공부하냐 ㅋ", "치사하다 진짜"];
  const RING_OUTER = ["치사", "개치사", "앞공부해", "앞공부해!!", "치사 ㅋ", "개치사!!!"];
  const RING_INNER = ["앞공부해", "치사!!", "개치사", "앞공부해!!"];
  const MEGA = ["니 혼자", "공부하냐 ㅋ"];
  const VOICE = "니 혼자 공부하냐 크크크. 치사. 개치사. 앞공부해. 앞공부해!";
  const COLORS = ["#ff2d55", "#ffcc00", "#34c759", "#00c7ff", "#af52de", "#ffffff", "#ff9500"];
  const RAINBOW = ["#ff2d2d", "#ff8a00", "#ffd400", "#2fd04a", "#00a8ff", "#3b4bff", "#a63bff"];
  const EYES_GUESS = [{ x: .37, y: .43 }, { x: .63, y: .43 }];
  const FACEAPI = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js";
  const FACEAPI_MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const still = global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const eyeCache = new WeakMap(); // img -> { src, pts }
  let faceapiReady = null, actx = null, running = false;

  // ---------- CSS (한 번만 주입) ----------
  const CSS = `
.sc-layer{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;transition:opacity .3s;font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.sc-layer.sc-out{opacity:0}
.sc-layer canvas{position:absolute;inset:0;width:100%;height:100%}
.sc-bg{position:absolute;inset:0;background:linear-gradient(120deg,#ff2d55,#ff9500,#ffcc00,#34c759,#00c7ff,#af52de,#ff2d55);background-size:300% 300%;opacity:.28;animation:sc-rb 1.2s linear infinite}
@keyframes sc-rb{to{background-position:200% 0}}
.sc-rays{position:absolute;left:50%;top:50%;width:260vmax;height:260vmax;margin:-130vmax 0 0 -130vmax;background:repeating-conic-gradient(rgba(255,255,255,.4) 0 7deg,rgba(255,230,0,.12) 7deg 18deg);animation:sc-spin 5s linear infinite}
@keyframes sc-spin{to{transform:rotate(360deg)}}
.sc-orbit{position:absolute;left:50%;top:50%;width:0;height:0;z-index:2;animation:sc-spin 2.4s linear infinite}
.sc-orbit.sc-rev{animation-duration:3.2s;animation-direction:reverse}
.sc-orbit span{position:absolute;left:0;top:0;transform:rotate(var(--a)) translateX(var(--rad))}
.sc-orbit b{display:block;transform:translate(-50%,-50%);white-space:nowrap;font-weight:900;font-size:clamp(22px,6vw,46px);line-height:1;color:var(--c);-webkit-text-stroke:2px #111;paint-order:stroke fill;text-shadow:0 0 16px var(--c);animation:sc-self .9s linear infinite}
.sc-orbit b.sc-rev{animation-direction:reverse;animation-duration:1.3s}
@keyframes sc-self{to{transform:translate(-50%,-50%) rotate(360deg)}}
.sc-spam{position:absolute;font-weight:900;white-space:nowrap;line-height:1;-webkit-text-stroke:2px #111;paint-order:stroke fill;transform:translate(-50%,-50%) rotate(var(--r));animation:sc-in .35s cubic-bezier(.2,1.8,.4,1),sc-wob .4s ease-in-out .35s infinite alternate}
@keyframes sc-in{from{transform:translate(-50%,-50%) rotate(var(--r)) scale(0)}}
@keyframes sc-wob{to{transform:translate(-50%,-50%) rotate(calc(var(--r) * -1)) scale(1.15)}}
.sc-mega{position:absolute;left:50%;top:50%;width:100%;padding-inline:16px;box-sizing:border-box;transform:translate(-50%,-50%);text-align:center;font-weight:900;font-size:clamp(48px,15vw,140px);line-height:1.05;color:#fff;-webkit-text-stroke:4px #e0312b;paint-order:stroke fill;text-shadow:0 0 30px #ff0,6px 6px 0 #111;animation:sc-pulse .22s ease-in-out infinite alternate;z-index:3}
.sc-mega small{display:table;margin:16px auto 0;font-size:15px;line-height:1.4;-webkit-text-stroke:0;text-shadow:none;background:#111;color:#fff;padding:4px 12px;border-radius:99px}
@keyframes sc-pulse{from{transform:translate(-50%,-50%) scale(.94) rotate(3deg)}to{transform:translate(-50%,-50%) scale(1.1) rotate(-3deg)}}
html.sc-on body{overflow-x:hidden;animation:sc-shake .12s linear infinite,sc-hue 1.2s linear infinite}
@keyframes sc-shake{0%{transform:translate(0,0)}25%{transform:translate(-8px,5px) rotate(-1deg)}50%{transform:translate(6px,-6px) rotate(1deg)}75%{transform:translate(-5px,-4px) rotate(-.5deg)}}
@keyframes sc-hue{from{filter:hue-rotate(0deg) saturate(1.6)}to{filter:hue-rotate(360deg) saturate(1.6)}}
@media (prefers-reduced-motion:reduce){html.sc-on body,.sc-mega,.sc-spam,.sc-rays,.sc-orbit,.sc-orbit b,.sc-bg{animation:none}}`;
  function injectCSS() {
    if (document.getElementById("super-chaos-css")) return;
    const st = document.createElement("style"); st.id = "super-chaos-css"; st.textContent = CSS; document.head.append(st);
  }

  // ---------- 눈 인식 (결과는 이미지 원본 기준 0~1 비율) ----------
  function loadFaceApi() {
    if (!faceapiReady) faceapiReady = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = FACEAPI; s.onload = res; s.onerror = rej; document.head.append(s);
    }).then(() => Promise.all([
      global.faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODELS),
      global.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACEAPI_MODELS),
    ]));
    return faceapiReady;
  }
  async function findEyes(img) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const avg = (ps) => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length / W, y: ps.reduce((a, p) => a + p.y, 0) / ps.length / H });
    if ("FaceDetector" in global) {
      try {
        const [f] = await new global.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }).detect(img);
        if (f) {
          const e = (f.landmarks || []).filter((l) => l.type === "eye").map((l) => avg(l.locations));
          if (e.length === 2) return e.sort((a, b) => a.x - b.x);
          const b = f.boundingBox;
          return [avg([{ x: b.x + b.width * .32, y: b.y + b.height * .4 }]), avg([{ x: b.x + b.width * .68, y: b.y + b.height * .4 }])];
        }
      } catch (_) {}
    }
    await loadFaceApi();
    const fa = global.faceapi;
    const r = await fa.detectSingleFace(img, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: .3 })).withFaceLandmarks(true);
    if (!r) return null;
    return [avg(r.landmarks.getLeftEye()), avg(r.landmarks.getRightEye())].sort((a, b) => a.x - b.x);
  }
  function prepare(img) {
    if (!img || !img.src) return Promise.resolve(null);
    const hit = eyeCache.get(img);
    if (hit && hit.src === img.src) return hit.p;
    const entry = { src: img.src, pts: null };
    const go = () => findEyes(img).then((p) => { if (entry.src === img.src) entry.pts = p; return p; }).catch(() => null);
    entry.p = img.complete && img.naturalWidth ? go() : new Promise((r) => img.addEventListener("load", () => r(go()), { once: true }));
    eyeCache.set(img, entry);
    return entry.p;
  }
  const eyeFracs = (img) => {
    const e = img && eyeCache.get(img);
    return (e && e.src === img.src && e.pts) || EYES_GUESS;
  };
  // 이미지 원본 비율 좌표 → 화면 좌표 (object-fit: cover / contain / fill 반영)
  function toScreen(img, p) {
    const r = img.getBoundingClientRect(), nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const fit = getComputedStyle(img).objectFit;
    let w = r.width, h = r.height;
    if (fit === "cover" || fit === "contain") {
      const s = (fit === "cover" ? Math.max : Math.min)(r.width / nw, r.height / nh); w = nw * s; h = nh * s;
    }
    return { x: r.left + (r.width - w) / 2 + p.x * w, y: r.top + (r.height - h) / 2 + p.y * h };
  }

  // ---------- 소리 ----------
  function fanfare() {
    try {
      actx = actx || new (global.AudioContext || global.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (_) { return () => {}; }
    const a = actx, t0 = a.currentTime;
    const out = a.createGain(); out.gain.value = .16; out.connect(a.destination);
    const note = (f, t, d, type = "sawtooth", v = 1) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + t); g.gain.linearRampToValueAtTime(v, t0 + t + .02);
      g.gain.setValueAtTime(v, t0 + t + d - .05); g.gain.linearRampToValueAtTime(0, t0 + t + d);
      o.connect(g); g.connect(out); o.start(t0 + t); o.stop(t0 + t + d + .02);
    };
    [[523, 0, .12], [523, .14, .12], [523, .28, .12], [698, .42, .5], [523, 1, .12], [698, 1.14, .12], [880, 1.28, .5], [1047, 1.9, .8]]
      .forEach(([f, t, d]) => { note(f, t, d); note(f * 1.006, t, d, "square", .45); note(f / 2, t, d, "triangle", .6); });
    [[2.85, .35], [3.3, .35], [3.75, 1]].forEach(([t, d]) => [466, 470, 233].forEach((f) => note(f, t, d, "sawtooth", .7)));
    return () => { out.gain.setTargetAtTime(0, a.currentTime, .05); setTimeout(() => out.disconnect(), 400); };
  }
  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(VOICE); u.lang = "ko-KR"; u.rate = 1.3; u.pitch = 1.7;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ---------- 본체 ----------
  function run(opt = {}) {
    if (running) return false; running = true;
    injectCSS();
    const duration = opt.duration || 5000;
    const srcImg = opt.image && opt.image.naturalWidth ? opt.image : null;
    if (srcImg) prepare(srcImg);

    const layer = document.createElement("div"); layer.className = "sc-layer"; layer.setAttribute("aria-hidden", "true");
    const bg = document.createElement("div"); bg.className = "sc-bg";
    const rays = document.createElement("div"); rays.className = "sc-rays";
    const cv = document.createElement("canvas");
    const mega = document.createElement("div"); mega.className = "sc-mega";
    mega.append(MEGA[0], document.createElement("br"), MEGA[1]);
    if (opt.nick) { const by = document.createElement("small"); by.textContent = `${opt.nick}님의 슈퍼난장판`; mega.append(by); }
    const ring = (words, rad, rev) => {
      const o = document.createElement("div"); o.className = "sc-orbit" + (rev ? " sc-rev" : "");
      words.forEach((w, i) => {
        const s = document.createElement("span");
        s.style.setProperty("--a", (i * 360) / words.length + "deg"); s.style.setProperty("--rad", rad);
        const b = document.createElement("b"); b.textContent = w; b.style.setProperty("--c", COLORS[i % COLORS.length]);
        if (i % 2) b.className = "sc-rev"; s.append(b); o.append(s);
      });
      return o;
    };
    layer.append(bg, rays, cv, ring(RING_OUTER, "min(42vw, 40vh)"), ring(RING_INNER, "min(25vw, 24vh)", true), mega);
    // body에 흔들기/색 회전을 거니까 레이어는 html에 붙여야 같이 안 흔들림
    document.documentElement.append(layer);
    document.documentElement.classList.add("sc-on");

    const stopSound = opt.sound === false ? () => {} : fanfare();
    if (opt.voice !== false) speak();
    const ctx = cv.getContext("2d"); const dpr = Math.min(2, global.devicePixelRatio || 1);
    const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener("resize", size);

    const P = [], heads = [];
    const small = innerWidth < 600, MAX_HEADS = small ? 5 : 8;
    const aspect = srcImg ? Math.min(1.6, Math.max(.7, srcImg.naturalHeight / srcImg.naturalWidth)) : 1;
    const t0 = performance.now(); let last = t0, spamAt = 0, burstAt = 0, boomAt = 0, headAt = 0, raf = 0;

    const confetti = (x, y, dir) => {
      for (let i = 0; i < 70; i++) {
        const a = dir + (Math.random() - .5) * .9, s = 600 + Math.random() * 700;
        P.push({ k: "c", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.random() * 6, vr: (Math.random() - .5) * 20, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: COLORS[i % COLORS.length], life: 3 });
      }
    };
    const firework = () => {
      const x = innerWidth * (.1 + Math.random() * .8), y = innerHeight * (.1 + Math.random() * .6), c = pick(COLORS);
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2, s = 220 + Math.random() * 260;
        P.push({ k: "s", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, max: 1.1, c: Math.random() < .3 ? "#fff" : c });
      }
    };
    const rainbow = () => {
      const L = Math.random() < .5;
      P.push({ k: "r", x: L ? -200 : innerWidth + 200, y: 80 + Math.random() * (innerHeight - 160), vx: (L ? 1 : -1) * (350 + Math.random() * 450), vy: (Math.random() - .5) * 120, r: Math.random() * 6, vr: (Math.random() - .5) * 4, s: .5 + Math.random() * 1.1, life: 4 });
    };
    const emoji = () => {
      P.push({ k: "e", ch: pick(["🔥", "📚", "🚫", "🎉", "🌈", "📖", "✏️", "🤬", "🎺", "🎊", "✨", "💥"]), x: Math.random() * innerWidth, y: innerHeight + 40, vx: (Math.random() - .5) * 300, vy: -(700 + Math.random() * 600), r: 0, vr: (Math.random() - .5) * 10, s: 28 + Math.random() * 40, life: 3 });
    };
    const spam = () => {
      const s = document.createElement("div"); s.className = "sc-spam";
      s.textContent = Math.random() < .4 ? SPAM[0] : pick(SPAM);
      s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
      s.style.fontSize = 18 + Math.random() * 52 + "px"; s.style.color = pick(COLORS);
      s.style.setProperty("--r", Math.random() * 50 - 25 + "deg");
      mega.before(s);
      const all = layer.querySelectorAll(".sc-spam"); if (all.length > 60) all[0].remove();
    };
    const addHead = () => {
      const s = (small ? 70 : 100) + Math.random() * 60, L = Math.random() < .5;
      heads.push({ x: L ? -s : innerWidth + s, y: 80 + Math.random() * (innerHeight - 160), vx: (L ? 1 : -1) * (150 + Math.random() * 250), vy: (Math.random() - .5) * 300, r: Math.random() * 6, vr: (Math.random() < .5 ? -1 : 1) * (2 + Math.random() * 4), s, born: performance.now(), ment: pick(HEAD_MENTS), c: pick(COLORS.slice(0, 5)) });
    };
    const headEyes = (h, sc) => {
      const w = h.s * sc, hh = h.s * aspect * sc, cos = Math.cos(h.r), sin = Math.sin(h.r);
      return eyeFracs(srcImg).map((p) => { const lx = (p.x - .5) * w, ly = (p.y - .5) * hh; return { x: h.x + lx * cos - ly * sin, y: h.y + lx * sin + ly * cos }; });
    };
    const laser = (e, a, len, k) => {
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * len, e.y + Math.sin(a) * len);
      ctx.strokeStyle = "rgba(255,40,0,.45)"; ctx.lineWidth = 26 * k; ctx.stroke();
      ctx.strokeStyle = "rgba(255,170,0,.7)"; ctx.lineWidth = 12 * k; ctx.stroke();
      ctx.strokeStyle = "#fffbd0"; ctx.lineWidth = 4 * k; ctx.stroke();
    };
    const glow = (e, r) => {
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, "#fff"); g.addColorStop(.25, "#fff36b"); g.addColorStop(.55, "#ff8a00"); g.addColorStop(1, "rgba(255,40,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    };
    const fire = (e, a, n) => {
      if (P.length > 2600) return;
      for (let k = 0; k < n; k++) {
        const aa = a + (Math.random() - .5) * .7, sp = 250 + Math.random() * 500;
        P.push({ k: "f", x: e.x, y: e.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: .7, max: .7, s: 10 + Math.random() * 18 });
      }
    };
    const drawHead = (h, sc, now) => {
      const w = h.s, hh = h.s * aspect;
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.r); ctx.scale(sc, sc);
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, w / 2, hh / 2, 0, 0, Math.PI * 2);
      if (srcImg) { ctx.clip(); ctx.drawImage(srcImg, -w / 2, -hh / 2, w, hh); }
      else { ctx.font = `${w}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("😡", 0, 0); }
      ctx.restore();
      ctx.lineWidth = 7; ctx.strokeStyle = RAINBOW[Math.floor(now / 70 + h.s) % RAINBOW.length];
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, hh / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `900 ${Math.round(w * .3)}px "Noto Sans KR", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = 7; ctx.strokeStyle = "#111"; ctx.strokeText(h.ment, 0, hh / 2 + w * .26);
      ctx.fillStyle = h.c; ctx.fillText(h.ment, 0, hh / 2 + w * .26);
      ctx.restore();
    };

    const end = () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size);
      layer.classList.add("sc-out"); setTimeout(() => layer.remove(), 350);
      document.documentElement.classList.remove("sc-on");
      stopSound(); try { speechSynthesis.cancel(); } catch (_) {}
      running = false;
      if (opt.onEnd) opt.onEnd();
    };

    function frame(now) {
      if (now - t0 > duration) return end();
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const W = innerWidth, H = innerHeight, sec = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      if (now - burstAt > 1200) { burstAt = now; confetti(0, H, -Math.PI / 3); confetti(W, H, -2 * Math.PI / 3); }
      if (now - boomAt > 350) { boomAt = now; firework(); }
      if (now - headAt > 550 && heads.length < MAX_HEADS) { headAt = now; addHead(); }
      if (Math.random() < dt * 3) rainbow();
      if (Math.random() < dt * 8) emoji();
      if (now - spamAt > (still ? 400 : 90)) { spamAt = now; spam(); }

      // 원본 사진(페이지에 있는 그 이미지)의 눈에서 레이저
      if (srcImg && srcImg.isConnected && srcImg.offsetParent !== null) {
        eyeFracs(srcImg).forEach((p, i) => {
          const e = toScreen(srcImg, p), a = -Math.PI / 2 + Math.sin(sec * 2.6 + i * 1.4) * 2.1;
          laser(e, a, 3000, 1); fire(e, a, 6); glow(e, 26 + Math.random() * 10);
        });
      }

      const hs = heads.map((h) => {
        h.x += h.vx * dt; h.y += h.vy * dt; h.r += h.vr * dt;
        const m = h.s * .6;
        if (h.x < m && h.vx < 0) h.vx = Math.abs(h.vx);
        if (h.x > W - m && h.vx > 0) h.vx = -Math.abs(h.vx);
        if (h.y < m && h.vy < 0) h.vy = Math.abs(h.vy);
        if (h.y > H - m && h.vy > 0) h.vy = -Math.abs(h.vy);
        const sc = Math.min(1, (now - h.born) / 300) * (1 + Math.sin(now / 110 + h.s) * .1);
        const a = h.r - Math.PI / 2 + Math.sin(now / 180 + h.s) * .35;
        headEyes(h, sc).forEach((e) => { laser(e, a, small ? 420 : 650, .55); fire(e, a, 2); });
        return [h, sc];
      });

      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.k === "c" || p.k === "e") { p.vy += 900 * dt; p.vx *= .99; }
        if (p.k === "s") { p.vy += 260 * dt; p.vx *= .97; p.vy *= .97; }
        if (p.k === "f") p.vy -= 200 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.r += p.vr * dt;
        if (p.life <= 0 || p.y > H + 300 || p.x < -500 || p.x > W + 500) { P.splice(i, 1); continue; }
        if (p.k === "f" || p.k === "s") {
          const t = p.life / p.max;
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = t;
          if (p.k === "f") {
            ctx.fillStyle = t > .65 ? "#fff6a0" : t > .35 ? "#ff9d00" : "#ff2a00";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (.4 + t), 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2 + 3 * t, 0, Math.PI * 2); ctx.fill();
          }
          continue;
        }
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        if (p.k === "c") { ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        else if (p.k === "e") { ctx.font = `${p.s}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.ch, 0, 0); }
        else if (p.k === "r") {
          ctx.scale(p.s, p.s); ctx.lineWidth = 12;
          RAINBOW.forEach((c, j) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(0, 0, 120 - j * 12, Math.PI, 0); ctx.stroke(); });
        }
        ctx.restore();
      }
      hs.forEach(([h, sc]) => drawHead(h, sc, now));
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return true;
  }

  const api = { run, prepare, isRunning: () => running };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.SuperChaos = api;
})(typeof window !== "undefined" ? window : globalThis);
