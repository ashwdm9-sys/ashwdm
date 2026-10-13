/*!
 * super-chaos.js — "슈퍼난장판" 5초 화면 폭주 효과 (의존성 없음, 단일 파일)
 *
 * 사용법
 *   <script src="super-chaos.js"> 로 불러오거나, HTML에 직접 붙여 넣어도 됨
 *   SuperChaos.prepare(imgEl);   // (선택) 얼굴 사진이 바뀔 때 미리 눈 위치 인식
 *   button.onclick = () => SuperChaos.choose((mode) => SuperChaos.run({ mode, image: imgEl, nick: "철수" }));
 *   // run은 반드시 사용자 클릭 안에서 호출해야 소리가 남 (choose의 콜백은 클릭 안에서 불림)
 *
 * 모드
 *   "fire"  눈빔 난장판: 눈에서 불 뿜는 얼굴들이 뱅글뱅글 떠다님
 *   "slap"  싸다구 난장판: 페이지 옆에 있던 손이 날아가 얼굴을 쉴 새 없이 후려침 (얼굴은 안 가림)
 *
 * choose(cb)   모드 선택 창을 띄우고, 고르면 cb(mode)를 클릭 안에서 바로 호출 (취소하면 호출 안 함)
 * run(options)
 *   mode      "fire" | "slap"   기본 "fire"
 *   image     HTMLImageElement  얼굴 사진. 없으면 😡 이모지 머리로 대체
 *   face      HTMLElement       (선택) 얼굴을 감싼 박스. 사진이 없을 때 위치 기준, 싸다구 맞고 흔들리는 대상
 *   hand      HTMLElement       (선택) 페이지에 있는 손 그림. 싸다구 모드에서 이 손이 직접 움직여 때림. 없으면 그려진 손이 양옆에서 때림
 *   nick      string            "OO님의 슈퍼난장판" 표시용
 *   duration  number            기본 5000ms
 *   sound     boolean           효과음 (기본 true)
 *   voice     boolean           음성 읽기 (기본 true)
 *   onEnd     function(mode)    끝나고 호출
 *
 * 얼굴 인식: 브라우저 FaceDetector → @vladmandic/face-api(CDN) → 실패 시 추정 위치 순으로 시도.
 */
(function (global) {
  "use strict";

  const MODES = {
    fire: {
      label: "🔥 눈빔 난장판", desc: "눈에서 불 뿜는 얼굴들이 뱅글뱅글 떠다님",
      spam: ["니혼자 공부하냐 ㅋ", "니혼자 공부하냐 ㅋㅋ", "니 혼자 공부하냐??? ㅋ", "혼자 공부하냐 ㅋ", "책 덮어 ㅋㅋㅋ", "뒷공부 적발 ㅋ", "배신자 ㅋㅋㅋㅋ", "공부 금지!!!", "형광펜 압수 ㅋ", "치사 ㅋ", "개치사", "앞공부해", "앞공부해!!!", "치사하게 뒷공부?", "개치사 ㅋㅋㅋ"],
      heads: ["치사", "개치사", "앞공부해", "앞공부해!!", "니혼자 공부하냐 ㅋ", "치사하다 진짜"],
      ringOuter: ["치사", "개치사", "앞공부해", "앞공부해!!", "치사 ㅋ", "개치사!!!"],
      ringInner: ["앞공부해", "치사!!", "개치사", "앞공부해!!"],
      mega: ["니 혼자", "공부하냐 ㅋ"],
      voice: "니 혼자 공부하냐 크크크. 치사. 개치사. 앞공부해. 앞공부해!",
    },
    slap: {
      label: "👋 싸다구 난장판", desc: "옆에 있던 손이 얼굴을 쉴 새 없이 후려침",
      spam: ["짝!!", "철썩!!", "싸다구 ㅋㅋ", "정신 차려!!", "뒷공부 하지마!!", "앞에서 공부해!!", "짝짝짝짝", "맞을래 공부할래", "볼 빨개짐 ㅋ", "니혼자 공부하냐 ㅋ", "책 덮어!!", "아야 ㅋㅋㅋ"],
      heads: ["아야!!", "짝!", "정신차려", "앞공부해!!", "잘못했어요", "철썩"],
      ringOuter: ["짝!", "철썩!", "싸다구!", "정신 차려!!", "짝짝!!", "앞공부해!"],
      ringInner: ["아야!", "짝!!", "철썩!!", "뒷공부 금지"],
      mega: ["뒷공부", "하지마!!"],
      voice: "짝! 짝! 정신 차려! 뒷공부 하지 마! 앞에서 공부해! 짝짝짝!",
    },
  };
  const SLAP_WORDS = ["짝!!", "철썩!!", "찰싹!", "짜악!!", "퍽!", "싸다구!!"];
  const COLORS = ["#ff2d55", "#ffcc00", "#34c759", "#00c7ff", "#af52de", "#ffffff", "#ff9500"];
  const RAINBOW = ["#ff2d2d", "#ff8a00", "#ffd400", "#2fd04a", "#00a8ff", "#3b4bff", "#a63bff"];
  const EYES_GUESS = [{ x: .37, y: .43 }, { x: .63, y: .43 }];
  const FACEAPI = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js";
  const FACEAPI_MODELS = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";
  const SLAP_SEC = .3; // 싸다구 한 대 주기

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const still = global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const eyeCache = new WeakMap(); // img -> { src, pts, p }
  let faceapiReady = null, actx = null, noise = null, running = false, active = null;

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
.sc-fg{z-index:2147483001}
.sc-combo{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));font-weight:900;font-size:clamp(28px,8vw,56px);line-height:1;white-space:nowrap;color:#ffcc00;-webkit-text-stroke:3px #111;paint-order:stroke fill;transform:translateX(-50%) rotate(-4deg)}
.sc-combo.sc-pop{animation:sc-cpop .2s cubic-bezier(.2,1.8,.4,1)}
@keyframes sc-cpop{from{transform:translateX(-50%) rotate(-4deg) scale(1.7)}}
html.sc-on body{overflow-x:hidden;animation:sc-shake .12s linear infinite,sc-hue 1.2s linear infinite}
html.sc-on.sc-slap body{animation:sc-shake .12s linear infinite}
@keyframes sc-shake{0%{transform:translate(0,0)}25%{transform:translate(-8px,5px) rotate(-1deg)}50%{transform:translate(6px,-6px) rotate(1deg)}75%{transform:translate(-5px,-4px) rotate(-.5deg)}}
@keyframes sc-hue{from{filter:hue-rotate(0deg) saturate(1.6)}to{filter:hue-rotate(360deg) saturate(1.6)}}
.sc-pick{position:fixed;inset:0;z-index:2147483002;display:grid;place-items:center;padding:16px;background:rgba(17,17,17,.55);font-family:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.sc-pick-box{width:min(420px,100%);background:#fff;color:#111;border:3px solid #111;border-radius:18px;padding:18px;display:grid;gap:10px;box-shadow:0 8px 0 #111}
.sc-pick h2{margin:0 0 4px;font-size:22px;font-weight:900;text-align:center}
.sc-pick-opt{display:grid;gap:2px;text-align:left;border:3px solid #111;border-radius:14px;padding:12px 14px;font:inherit;font-size:20px;font-weight:900;line-height:1.25;color:#fff;cursor:pointer;box-shadow:0 4px 0 #111;text-shadow:0 2px 0 rgba(0,0,0,.3)}
.sc-pick-opt small{font-size:13px;font-weight:700}
.sc-pick-opt.fire{background:linear-gradient(90deg,#e8380d,#ff9d00)}
.sc-pick-opt.slap{background:linear-gradient(90deg,#e0245e,#9b3fd1)}
.sc-pick-opt:active{transform:translateY(3px);box-shadow:0 1px 0 #111}
.sc-pick-opt:focus-visible,.sc-pick-x:focus-visible{outline:3px solid #00a8ff;outline-offset:2px}
.sc-pick-x{justify-self:center;border:0;background:none;font:inherit;font-size:14px;color:#5b5552;font-weight:700;cursor:pointer;padding:6px 12px}
@media (prefers-reduced-motion:reduce){html.sc-on body,.sc-mega,.sc-spam,.sc-rays,.sc-orbit,.sc-orbit b,.sc-bg,.sc-combo{animation:none}}`;
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
  const MUTE = { slap() {}, boing() {}, stop() {} };
  function startAudio(mode) {
    try {
      actx = actx || new (global.AudioContext || global.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
    } catch (_) { return MUTE; }
    const a = actx, t0 = a.currentTime;
    const out = a.createGain(); out.gain.value = .16; out.connect(a.destination);
    const note = (f, t, d, type = "sawtooth", v = 1) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + t); g.gain.linearRampToValueAtTime(v, t0 + t + .02);
      g.gain.setValueAtTime(v, t0 + t + d - .05); g.gain.linearRampToValueAtTime(0, t0 + t + d);
      o.connect(g); g.connect(out); o.start(t0 + t); o.stop(t0 + t + d + .02);
    };
    // 빠바바밤~ 빠바바바밤~~
    [[523, 0, .12], [523, .14, .12], [523, .28, .12], [698, .42, .5], [523, 1, .12], [698, 1.14, .12], [880, 1.28, .5], [1047, 1.9, .8]]
      .forEach(([f, t, d]) => { note(f, t, d); note(f * 1.006, t, d, "square", .45); note(f / 2, t, d, "triangle", .6); });
    // 에어혼 (눈빔 모드만. 싸다구 모드는 찰싹 소리가 주인공)
    if (mode === "fire") [[2.85, .35], [3.3, .35], [3.75, 1]].forEach(([t, d]) => [466, 470, 233].forEach((f) => note(f, t, d, "sawtooth", .7)));
    if (!noise) {
      noise = a.createBuffer(1, Math.floor(a.sampleRate * .16), a.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 5);
    }
    return {
      slap() { // 찰싹: 짧은 잡음을 대역 통과 필터로 깎은 것
        const s = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
        s.buffer = noise; bp.type = "bandpass"; bp.frequency.value = 1600 + Math.random() * 900; bp.Q.value = .8; g.gain.value = 5;
        s.connect(bp); bp.connect(g); g.connect(out); s.start();
      },
      boing() {
        const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
        o.type = "sine"; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(110, t + .4);
        g.gain.setValueAtTime(1.2, t); g.gain.linearRampToValueAtTime(0, t + .42);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + .45);
      },
      stop() { out.gain.setTargetAtTime(0, a.currentTime, .05); setTimeout(() => out.disconnect(), 400); },
    };
  }
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.rate = 1.3; u.pitch = 1.7;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ---------- 모드 선택 창 ----------
  function choose(cb) {
    injectCSS();
    if (running || document.querySelector(".sc-pick")) return;
    const back = document.createElement("div"); back.className = "sc-pick";
    back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true"); back.setAttribute("aria-label", "슈퍼난장판 모드 선택");
    const box = document.createElement("div"); box.className = "sc-pick-box";
    const h = document.createElement("h2"); h.textContent = "어떤 난장판?"; box.append(h);
    const before = document.activeElement;
    const close = () => { back.remove(); removeEventListener("keydown", onKey); if (before && before.focus) before.focus(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    Object.keys(MODES).forEach((k) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sc-pick-opt " + k;
      b.append(MODES[k].label); const s = document.createElement("small"); s.textContent = MODES[k].desc; b.append(s);
      b.onclick = () => { close(); cb(k); };
      box.append(b);
    });
    const x = document.createElement("button"); x.type = "button"; x.className = "sc-pick-x"; x.textContent = "취소"; x.onclick = close;
    box.append(x);
    back.onclick = (e) => { if (e.target === back) close(); };
    addEventListener("keydown", onKey);
    back.append(box); document.body.append(back);
    box.querySelector("button").focus();
  }

  // ---------- 본체 ----------
  function run(opt = {}) {
    if (running) return false; running = true;
    injectCSS();
    const mode = MODES[opt.mode] ? opt.mode : "fire", M = MODES[mode], slapMode = mode === "slap";
    const duration = opt.duration || 5000;
    const srcImg = opt.image && opt.image.naturalWidth ? opt.image : null;
    if (srcImg) prepare(srcImg);
    const faceEl = opt.face || srcImg;

    const layer = document.createElement("div"); layer.className = "sc-layer"; layer.setAttribute("aria-hidden", "true");
    const bg = document.createElement("div"); bg.className = "sc-bg";
    const rays = document.createElement("div"); rays.className = "sc-rays";
    const cv = document.createElement("canvas");
    const mega = document.createElement("div"); mega.className = "sc-mega";
    mega.append(M.mega[0], document.createElement("br"), M.mega[1]);
    if (opt.nick) { const by = document.createElement("small"); by.textContent = `${opt.nick}님의 ${M.label.replace(/^\S+\s/, "")}`; mega.append(by); }
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
    const comboEl = document.createElement("div"); comboEl.className = "sc-combo";
    layer.append(bg, rays, cv, ring(M.ringOuter, "min(42vw, 40vh)"), ring(M.ringInner, "min(25vw, 24vh)", true), mega);
    // 맨 위 레이어: 마스크 없이 얼굴 바깥에 그리는 것들 (짝!! 글자, 콤보, 손 속도선)
    const fg = document.createElement("div"); fg.className = "sc-layer sc-fg";
    const fcv = document.createElement("canvas"); fg.append(fcv);
    if (slapMode) fg.append(comboEl);
    // body에 흔들기/색 회전을 거니까 레이어는 html에 붙여야 같이 안 흔들림
    document.documentElement.append(layer, fg);

    // snapshot() 이 쓸 재료. 손은 SVG 라서 미리 이미지로 만들어 둔다.
    active = { layer, cv, fcv, faceEl, hand: opt.hand || null, srcImg, mode, nick: opt.nick || "", lines: M.mega, label: M.label.replace(/^\S+\s/, ""), handImg: null };
    if (opt.hand && opt.hand.cloneNode) {
      try {
        const clone = opt.hand.cloneNode(true);
        clone.removeAttribute("class"); clone.removeAttribute("style");
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const cs = getComputedStyle(opt.hand);
        clone.setAttribute("width", parseFloat(cs.width) || 200); clone.setAttribute("height", parseFloat(cs.height) || 300);
        const im = new Image();
        im.onload = () => { if (active) active.handImg = im; };
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      } catch (_) {}
    }

    const audio = opt.sound === false ? MUTE : startAudio(mode);
    if (opt.voice !== false) speak(M.voice);
    const ctx = cv.getContext("2d"), fctx = fcv.getContext("2d"), dpr = Math.min(2, global.devicePixelRatio || 1);
    let g = ctx; // 지금 그리는 캔버스 (ctx: 마스크된 배경 레이어, fctx: 맨 위)

    const P = [], heads = [];
    const small = innerWidth < 600, MAX_HEADS = small ? 5 : 8;
    const aspect = srcImg ? Math.min(1.6, Math.max(.7, srcImg.naturalHeight / srcImg.naturalWidth)) : 1;
    const t0 = performance.now(); let last = t0, spamAt = 0, burstAt = 0, boomAt = 0, headAt = 0, raf = 0, lastHit = -1, combo = 0;

    // 얼굴 위치: 사진 → 얼굴 박스 → (둘 다 없으면) 화면 아래쪽 가상 얼굴
    const faceRect = () => {
      const el = visible(faceEl) ? faceEl : visible(srcImg) ? srcImg : null;
      if (el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, real: true }; }
      const w = Math.min(innerWidth, innerHeight) * .34;
      return { x: innerWidth / 2 - w / 2, y: innerHeight * .62 - w * .6, w, h: w * 1.2, real: false };
    };
    // 싸다구 모드: 얼굴(+손 이동 경로)만 효과 레이어에서 뚫어서 절대 가리지 않음
    const domHand = slapMode && visible(opt.hand) ? opt.hand : null;
    const handPrevT = domHand ? domHand.style.transform : "";
    let hole = null, handRest = null, handDelta = null, handSide = -1;
    const applyHole = () => {
      const W = innerWidth, H = innerHeight, { x, y, w, h } = hole, r = Math.min(28, w / 2, h / 2);
      const d = `M0 0H${W}V${H}H0Z M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
      const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'><path fill-rule='evenodd' d='${d}'/></svg>`)}") 0 0 / 100% 100% no-repeat`;
      layer.style.setProperty("-webkit-mask", url); layer.style.setProperty("mask", url);
    };
    const measure = () => {
      if (!slapMode) return;
      const r = faceRect(); if (!r.real) return;
      let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (domHand) {
        const t = domHand.style.transform; domHand.style.transform = handPrevT;
        const h = domHand.getBoundingClientRect(); domHand.style.transform = t;
        handRest = h; handSide = h.left + h.width / 2 < r.x + r.w / 2 ? -1 : 1;
        // 손바닥 윗부분(얼굴 쪽)이 얼굴 가장자리 뺨에 닿는 만큼 이동
        const P0 = { x: handSide < 0 ? r.x + r.w * .02 : r.x + r.w * .98, y: r.y + r.h * .5 };
        const C0 = { x: handSide < 0 ? h.right - h.width * .1 : h.left + h.width * .1, y: h.top + h.height * .32 };
        handDelta = { x: P0.x - C0.x, y: P0.y - C0.y, px: P0.x, py: P0.y, cx: C0.x, cy: C0.y };
        [[0, 0], [handDelta.x, handDelta.y]].forEach(([ox, oy]) => {
          x0 = Math.min(x0, h.left + ox); y0 = Math.min(y0, h.top + oy); x1 = Math.max(x1, h.right + ox); y1 = Math.max(y1, h.bottom + oy);
        });
      }
      hole = { x: x0 - 24, y: y0 - 24, w: x1 - x0 + 48, h: y1 - y0 + 48 };
      applyHole();
    };
    // 짝!! 글자는 구멍 바깥(왼쪽/오른쪽/위)에 둠
    const burstSpot = (py, s) => {
      const R = 115 * s, b = hole;
      if (!b) return { x: innerWidth / 2, y: Math.max(R, py - R * 1.6) };
      const c = [{ x: b.x - R * .75, y: py }, { x: b.x + b.w + R * .75, y: py }, { x: b.x + b.w * (.2 + Math.random() * .6), y: b.y - R * .65 }]
        .filter((p) => p.x > R * .6 && p.x < innerWidth - R * .6 && p.y > R * .6 && p.y < innerHeight - R * .6);
      return c.length ? pick(c) : { x: b.x + b.w / 2, y: Math.max(R * .6, b.y - R * .65) };
    };
    const size = () => {
      [cv, fcv].forEach((c) => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      measure();
    };
    size(); addEventListener("resize", size);
    document.documentElement.classList.add("sc-on");
    if (slapMode) document.documentElement.classList.add("sc-slap");

    const eyeScreen = (p) => {
      if (visible(srcImg)) return toScreen(srcImg, p);
      const r = faceRect(); return { x: r.x + p.x * r.w, y: r.y + p.y * r.h };
    };

    const confetti = (x, y, dir) => {
      for (let i = 0; i < 70; i++) {
        const a = dir + (Math.random() - .5) * .9, s = 600 + Math.random() * 700;
        P.push({ k: "c", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.random() * 6, vr: (Math.random() - .5) * 20, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: COLORS[i % COLORS.length], life: 3 });
      }
    };
    const sparks = (x, y, n, c, sp = 240) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = sp + Math.random() * sp * 1.1;
        P.push({ k: "s", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, max: 1.1, c: Math.random() < .3 ? "#fff" : c });
      }
    };
    const firework = () => sparks(innerWidth * (.1 + Math.random() * .8), innerHeight * (.1 + Math.random() * .6), 44, pick(COLORS));
    const rainbow = () => {
      const L = Math.random() < .5;
      P.push({ k: "r", x: L ? -200 : innerWidth + 200, y: 80 + Math.random() * (innerHeight - 160), vx: (L ? 1 : -1) * (350 + Math.random() * 450), vy: (Math.random() - .5) * 120, r: Math.random() * 6, vr: (Math.random() - .5) * 4, s: .5 + Math.random() * 1.1, life: 4 });
    };
    const emoji = (ch, x, y, vy) => {
      P.push({ k: "e", ch: ch || pick(slapMode ? ["👋", "🖐️", "💥", "⭐", "💫", "🎉", "🌈", "✨", "🤚", "😵"] : ["🔥", "📚", "🚫", "🎉", "🌈", "📖", "✏️", "🤬", "🎺", "🎊", "✨", "💥"]), x: x ?? Math.random() * innerWidth, y: y ?? innerHeight + 40, vx: (Math.random() - .5) * 300, vy: vy ?? -(700 + Math.random() * 600), r: 0, vr: (Math.random() - .5) * 10, s: 28 + Math.random() * 40, life: 3 });
    };
    const spam = () => {
      const s = document.createElement("div"); s.className = "sc-spam";
      s.textContent = Math.random() < .4 ? M.spam[0] : pick(M.spam);
      s.style.left = Math.random() * 100 + "%"; s.style.top = Math.random() * 100 + "%";
      s.style.fontSize = 18 + Math.random() * 52 + "px"; s.style.color = pick(COLORS);
      s.style.setProperty("--r", Math.random() * 50 - 25 + "deg");
      mega.before(s);
      const all = layer.querySelectorAll(".sc-spam"); if (all.length > 60) all[0].remove();
    };
    const addHead = () => {
      const s = (small ? 70 : 100) + Math.random() * 60, L = Math.random() < .5, vr = (Math.random() < .5 ? -1 : 1) * (2 + Math.random() * 4);
      heads.push({ x: L ? -s : innerWidth + s, y: 80 + Math.random() * (innerHeight - 160), vx: (L ? 1 : -1) * (150 + Math.random() * 250), vy: (Math.random() - .5) * 300, r: Math.random() * 6, vr, vr0: vr, s, born: performance.now(), ment: pick(M.heads), c: pick(COLORS.slice(0, 5)), hits: 0, swing: 0, side: 1, next: performance.now() + 300 + Math.random() * 500 });
    };
    const headEyes = (h, sc) => {
      const w = h.s * sc, hh = h.s * aspect * sc, cos = Math.cos(h.r), sin = Math.sin(h.r);
      return eyeFracs(srcImg).map((p) => { const lx = (p.x - .5) * w, ly = (p.y - .5) * hh; return { x: h.x + lx * cos - ly * sin, y: h.y + lx * sin + ly * cos }; });
    };
    const laser = (e, a, len, k) => {
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 1; g.lineCap = "round";
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + Math.cos(a) * len, e.y + Math.sin(a) * len);
      g.strokeStyle = "rgba(255,40,0,.45)"; g.lineWidth = 26 * k; g.stroke();
      g.strokeStyle = "rgba(255,170,0,.7)"; g.lineWidth = 12 * k; g.stroke();
      g.strokeStyle = "#fffbd0"; g.lineWidth = 4 * k; g.stroke();
    };
    const glow = (e, r) => {
      g.globalCompositeOperation = "lighter"; g.globalAlpha = 1;
      const grad = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      grad.addColorStop(0, "#fff"); grad.addColorStop(.25, "#fff36b"); grad.addColorStop(.55, "#ff8a00"); grad.addColorStop(1, "rgba(255,40,0,0)");
      g.fillStyle = grad; g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
    };
    const fire = (e, a, n) => {
      if (P.length > 2600) return;
      for (let k = 0; k < n; k++) {
        const aa = a + (Math.random() - .5) * .7, sp = 250 + Math.random() * 500;
        P.push({ k: "f", x: e.x, y: e.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: .7, max: .7, s: 10 + Math.random() * 18 });
      }
    };
    // 손바닥 (손가락이 위, 원점 = 손바닥 중심, 약 110x190). mark=true면 빨간 손자국
    const drawHand = (x, y, rot, s, flip, mark) => {
      g.save(); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      g.translate(x, y); g.rotate(rot); g.scale(flip ? -s : s, s);
      g.fillStyle = mark ? "rgba(225,20,20,.38)" : "#f1c6a6"; g.strokeStyle = "#c98a66"; g.lineWidth = 4; g.lineJoin = "round";
      const part = (px, py, w, h, r) => { g.beginPath(); g.roundRect(px, py, w, h, r); g.fill(); if (!mark) g.stroke(); };
      part(-52, -122, 24, 92, 12); part(-26, -142, 26, 112, 13); part(2, -134, 26, 106, 13); part(30, -110, 22, 84, 11);
      g.save(); g.translate(-48, 12); g.rotate(-.95); part(-12, -72, 24, 72, 12); g.restore();
      part(-56, -52, 112, 104, [20, 20, 46, 46]);
      if (!mark) {
        g.strokeStyle = "rgba(201,138,102,.75)"; g.lineWidth = 3; g.beginPath();
        g.moveTo(-34, -2); g.quadraticCurveTo(0, 14, 36, -8); g.moveTo(-28, 20); g.quadraticCurveTo(4, 32, 32, 14); g.stroke();
      }
      g.restore();
    };
    const drawHead = (h, sc, now) => {
      const w = h.s, hh = h.s * aspect;
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      g.save(); g.translate(h.x, h.y); g.rotate(h.r); g.scale(sc, sc);
      g.save(); g.beginPath(); g.ellipse(0, 0, w / 2, hh / 2, 0, 0, Math.PI * 2);
      if (srcImg) { g.clip(); g.drawImage(srcImg, -w / 2, -hh / 2, w, hh); }
      else { g.font = `${w}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(slapMode ? "😵" : "😡", 0, 0); }
      if (h.hits) { // 맞을수록 볼이 빨개짐
        g.fillStyle = `rgba(255,20,40,${Math.min(.55, .18 + h.hits * .08)})`;
        [-1, 1].forEach((sd) => { g.beginPath(); g.ellipse(sd * w * .26, hh * .12, w * .15, w * .11, 0, 0, Math.PI * 2); g.fill(); });
      }
      g.restore();
      g.lineWidth = 7; g.strokeStyle = RAINBOW[Math.floor(now / 70 + h.s) % RAINBOW.length];
      g.beginPath(); g.ellipse(0, 0, w / 2, hh / 2, 0, 0, Math.PI * 2); g.stroke();
      g.font = `900 ${Math.round(w * .3)}px "Noto Sans KR", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 7; g.strokeStyle = "#111"; g.strokeText(h.ment, 0, hh / 2 + w * .26);
      g.fillStyle = h.c; g.fillText(h.ment, 0, hh / 2 + w * .26);
      g.restore();
    };
    // 만화 효과음 폭발 (뾰족 별 + 글자)
    const drawBurst = (p) => {
      const t = p.life / p.max, s = p.s * (1 + (1 - t) * .45);
      g.save(); g.globalCompositeOperation = "source-over"; g.globalAlpha = Math.min(1, t * 2.5);
      g.translate(p.x, p.y); g.rotate(p.rot); g.scale(s, s);
      const star = (ro, ri, n, fill) => {
        g.beginPath();
        for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? ri : ro; g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r); }
        g.closePath(); g.fillStyle = fill; g.fill();
      };
      g.lineWidth = 5; g.strokeStyle = "#111";
      star(92, 56, 12, "#ffe600"); g.stroke(); star(68, 40, 12, p.c);
      g.font = '900 46px "Noto Sans KR", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 9; g.strokeText(p.txt, 0, 2); g.fillStyle = "#fff"; g.fillText(p.txt, 0, 2);
      g.restore();
    };
    const drawWave = (p) => {
      const t = p.life / p.max;
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = t;
      g.strokeStyle = "#fff"; g.lineWidth = 12 * t; g.beginPath(); g.arc(p.x, p.y, 20 + (1 - t) * p.r, 0, Math.PI * 2); g.stroke();
      g.restore();
    };
    const pow = (x, y, s, word) => {
      P.push({ k: "b", x, y, life: .45, max: .45, txt: word || pick(SLAP_WORDS), rot: (Math.random() - .5) * .6, s, c: pick(COLORS.slice(0, 5)) });
    };

    // 메인 얼굴 싸다구 한 대 (side: 손이 오는 쪽, -1 왼쪽 / 1 오른쪽)
    const hitFace = (side, r) => {
      combo++;
      comboEl.textContent = `${combo} COMBO!!`; comboEl.classList.remove("sc-pop"); void comboEl.offsetWidth; comboEl.classList.add("sc-pop");
      const px = side < 0 ? r.x + r.w * .06 : r.x + r.w * .94, py = r.y + r.h * .5;
      const s = Math.max(.7, Math.min(1.3, r.w / 200)), at = burstSpot(py, s);
      pow(at.x, at.y, s);
      P.push({ k: "w", x: px, y: py, life: .5, max: .5, r: 170 * s });
      sparks(px, py, 26, pick(COLORS.slice(0, 5)), 280);
      for (let i = 0; i < 3; i++) emoji(pick(["⭐", "💫", "✨"]), r.x + r.w * (.3 + Math.random() * .4), r.y, -(300 + Math.random() * 400));
      if (r.real && faceEl && faceEl.animate) faceEl.animate([
        { transform: `translateX(${-side * 22}px) rotate(${-side * 12}deg)`, filter: "brightness(1.2) saturate(1.7)" },
        { transform: "none", filter: "none" },
      ], { duration: 280, easing: "cubic-bezier(.2,1.6,.4,1)" });
      if (!still && document.body.animate) document.body.animate([{ transform: `translate(${-side * 16}px, 6px)` }, { transform: "none" }], { duration: 140 });
      audio.slap();
      if (combo % 5 === 0) audio.boing();
    };

    const end = () => {
      cancelAnimationFrame(raf); removeEventListener("resize", size);
      layer.classList.add("sc-out"); fg.classList.add("sc-out"); setTimeout(() => { layer.remove(); fg.remove(); }, 350);
      document.documentElement.classList.remove("sc-on", "sc-slap");
      active = null;
      if (domHand) domHand.style.transform = handPrevT;
      audio.stop(); try { speechSynthesis.cancel(); } catch (_) {}
      running = false;
      if (opt.onEnd) opt.onEnd(mode);
    };

    function frame(now) {
      if (now - t0 > duration) return end();
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const W = innerWidth, H = innerHeight, sec = (now - t0) / 1000;
      g = ctx; ctx.clearRect(0, 0, W, H); fctx.clearRect(0, 0, W, H);

      // 빵빠레: 양쪽 아래 모서리에서 1.2초마다 꽃가루 발사 + 공중 폭죽
      if (now - burstAt > 1200) { burstAt = now; confetti(0, H, -Math.PI / 3); confetti(W, H, -2 * Math.PI / 3); }
      if (now - boomAt > 350) { boomAt = now; firework(); }
      if (now - headAt > 550 && heads.length < MAX_HEADS) { headAt = now; addHead(); }
      if (Math.random() < dt * 3) rainbow();
      if (Math.random() < dt * 8) emoji();
      if (now - spamAt > (still ? 400 : 90)) { spamAt = now; spam(); }

      // 눈빔 모드: 원본 얼굴 눈에서 레이저
      if (!slapMode && (visible(srcImg) || visible(faceEl))) {
        eyeFracs(visible(srcImg) ? srcImg : null).forEach((p, i) => {
          const e = eyeScreen(p), a = -Math.PI / 2 + Math.sin(sec * 2.6 + i * 1.4) * 2.1;
          laser(e, a, 3000, 1); fire(e, a, 6); glow(e, 26 + Math.random() * 10);
        });
      }

      // 떠다니는 머리들
      const hs = heads.map((h) => {
        h.x += h.vx * dt; h.y += h.vy * dt; h.r += h.vr * dt;
        const m = h.s * .6;
        if (h.x < m && h.vx < 0) h.vx = Math.abs(h.vx);
        if (h.x > W - m && h.vx > 0) h.vx = -Math.abs(h.vx);
        if (h.y < m && h.vy < 0) h.vy = Math.abs(h.vy);
        if (h.y > H - m && h.vy > 0) h.vy = -Math.abs(h.vy);
        const sc = Math.min(1, (now - h.born) / 300) * (1 + Math.sin(now / 110 + h.s) * .1);
        if (slapMode) {
          h.vr += (h.vr0 - h.vr) * Math.min(1, dt * 2.5);
          if (!h.swing && now >= h.next) { h.swing = now; h.side = Math.random() < .5 ? -1 : 1; }
          if (h.swing && now - h.swing >= 160) { // 명중
            h.swing = 0; h.next = now + 380 + Math.random() * 520; h.hits++;
            h.vr += -h.side * (10 + Math.random() * 8); h.vx += -h.side * 380; h.vy -= 120;
            pow(h.x + h.side * h.s * .3, h.y, .5);
            P.push({ k: "w", x: h.x, y: h.y, life: .5, max: .5, r: 85 });
            sparks(h.x, h.y, 14, pick(COLORS.slice(0, 5)), 200);
          }
        } else {
          const a = h.r - Math.PI / 2 + Math.sin(now / 180 + h.s) * .35;
          headEyes(h, sc).forEach((e) => { laser(e, a, small ? 420 : 650, .55); fire(e, a, 2); });
        }
        return [h, sc];
      });

      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt;
        if (p.k === "c" || p.k === "e") { p.vy += 900 * dt; p.vx *= .99; }
        if (p.k === "s") { p.vy += 260 * dt; p.vx *= .97; p.vy *= .97; }
        if (p.k === "f") p.vy -= 200 * dt;
        if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
        if (p.vr) p.r += p.vr * dt;
        if (p.life <= 0 || p.y > H + 300 || p.x < -500 || p.x > W + 500) { P.splice(i, 1); continue; }
        if (p.k === "b" || p.k === "w") continue; // 맨 위에 따로 그림
        if (p.k === "f" || p.k === "s") {
          const t = p.life / p.max;
          g.globalCompositeOperation = "lighter"; g.globalAlpha = t;
          if (p.k === "f") {
            g.fillStyle = t > .65 ? "#fff6a0" : t > .35 ? "#ff9d00" : "#ff2a00";
            g.beginPath(); g.arc(p.x, p.y, p.s * (.4 + t), 0, Math.PI * 2); g.fill();
          } else {
            g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 2 + 3 * t, 0, Math.PI * 2); g.fill();
          }
          continue;
        }
        g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r);
        if (p.k === "c") { g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        else if (p.k === "e") { g.font = `${p.s}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(p.ch, 0, 0); }
        else if (p.k === "r") {
          g.scale(p.s, p.s); g.lineWidth = 12;
          RAINBOW.forEach((c, j) => { g.strokeStyle = c; g.beginPath(); g.arc(0, 0, 120 - j * 12, Math.PI, 0); g.stroke(); });
        }
        g.restore();
      }
      hs.forEach(([h, sc]) => {
        drawHead(h, sc, now);
        if (slapMode && h.swing) { // 머리 옆에서 날아오는 작은 손
          const k = Math.min(1, (now - h.swing) / 160) ** 2, hsz = h.s / 170;
          drawHand(h.x + h.side * (h.s * .55 + (1 - k) * h.s * 1.3), h.y - (1 - k) * 30, h.side * (.25 + (1 - k) * .9), hsz, h.side > 0);
        }
      });

      P.forEach((p) => { if (p.k === "w") drawWave(p); });
      g = fctx; // 여기부터 맨 위 (얼굴 안 가리는 위치에만 그림)

      // 싸다구 모드: 옆에 있던 손이 날아가서 뺨을 후려침
      if (slapMode) {
        const r = faceRect();
        const n = Math.floor(sec / SLAP_SEC), ph = (sec % SLAP_SEC) / SLAP_SEC;
        if (!r.real) { g.save(); g.font = `${r.w}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("😵", r.x + r.w / 2, r.y + r.h / 2); g.restore(); }
        if (domHand && handDelta) {
          // 0~.15 뒤로 젖히기 → .55까지 가속하며 후려치기 → 복귀
          let u, rot;
          if (ph < .15) { const t = ph / .15; u = -.2 * t; rot = -6 - 34 * t; }
          else if (ph < .55) { const t = ((ph - .15) / .4) ** 2; u = -.2 + 1.2 * t; rot = -40 + 48 * t; }
          else { const t = 1 - (1 - (ph - .55) / .45) ** 2; u = 1 - t; rot = 8 - 14 * t; }
          const m = handSide < 0 ? 1 : -1;
          domHand.style.transform = `translate(${u * handDelta.x}px, ${u * handDelta.y}px) rotate(${rot * m}deg)`;
          if (ph > .3 && ph < .55) { // 속도선 (손 뒤쪽)
            const cx = handDelta.cx + u * handDelta.x, cy = handDelta.cy + u * handDelta.y;
            const len = Math.hypot(handDelta.x, handDelta.y) || 1, ux = handDelta.x / len, uy = handDelta.y / len;
            g.save(); g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 4; g.lineCap = "round";
            for (let j = -2; j <= 2; j++) {
              const ox = cx - ux * 70 - uy * j * 22, oy = cy - uy * 70 + ux * j * 22;
              g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox - ux * (60 + Math.abs(j) * 18), oy - uy * (60 + Math.abs(j) * 18)); g.stroke();
            }
            g.restore();
          }
          if (n > lastHit && ph >= .55) { lastHit = n; hitFace(handSide, r); }
        } else {
          // 페이지에 손이 없으면 그린 손이 양옆에서 번갈아 (얼굴 가장자리까지만)
          const side = n % 2 ? 1 : -1;
          if (n > lastHit && ph >= .55) { lastHit = n; hitFace(side, r); }
          const k = ph < .55 ? (ph / .55) ** 2 : 1 - (ph - .55) / .45;
          const hsz = Math.max(.55, Math.min(1.4, r.w / 170));
          const hx = r.x + r.w / 2 + side * (r.w / 2 + 44 * hsz + (1 - k) * (r.w * .6 + 120 * hsz));
          drawHand(hx, r.y + r.h * .5 - (1 - k) * 50, side * (.25 + (1 - k) * .9), hsz, side > 0);
        }
      }

      P.forEach((p) => { if (p.k === "b") drawBurst(p); });

      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return true;
  }

  // ---------- 지금 화면을 이미지로 (난장판이 도는 동안만 사용 가능) ----------
  // 효과 캔버스 + 글자들 + (효과 아래에 깔린) 모델 얼굴과 손을 합성한다. 페이지 나머지 부분은 포함하지 않는다.
  function snapshot() {
    if (!active) return null;
    const { layer, cv, fcv, faceEl, hand, handImg, srcImg, mode, nick, lines, label } = active;
    const W = innerWidth, H = innerHeight, sc = Math.min(2, global.devicePixelRatio || 1);
    const c = document.createElement("canvas"); c.width = Math.round(W * sc); c.height = Math.round(H * sc);
    const g = c.getContext("2d"); g.scale(sc, sc);

    g.fillStyle = "#fff6e6"; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2);
    const R = Math.hypot(W, H);
    for (let i = 0; i < 36; i += 2) {
      const a0 = (i / 36) * Math.PI * 2, a1 = ((i + 1) / 36) * Math.PI * 2;
      g.fillStyle = "rgba(255,225,0,.2)"; g.beginPath(); g.moveTo(0, 0);
      g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); g.closePath(); g.fill();
    }
    g.restore();
    const grad = g.createLinearGradient(0, 0, W, H);
    ["#ff2d55", "#ff9500", "#ffcc00", "#34c759", "#00c7ff", "#af52de"].forEach((col, i, a) => grad.addColorStop(i / (a.length - 1), col));
    g.globalAlpha = .28; g.fillStyle = grad; g.fillRect(0, 0, W, H); g.globalAlpha = 1;

    const face = () => {
      const r = visible(faceEl) ? faceEl.getBoundingClientRect() : null;
      if (r) {
        const rx = r.width / 2, ry = r.height * .38;
        g.save(); g.beginPath(); g.moveTo(r.left, r.bottom); g.lineTo(r.left, r.top + ry);
        g.ellipse(r.left + rx, r.top + ry, rx, ry, 0, Math.PI, 0); g.lineTo(r.right, r.bottom); g.closePath();
        g.fillStyle = "#e9e5e2"; g.fill(); g.clip();
        if (visible(srcImg)) {
          const s = Math.max(r.width / srcImg.naturalWidth, r.height / srcImg.naturalHeight);
          const w = srcImg.naturalWidth * s, h = srcImg.naturalHeight * s;
          try { g.drawImage(srcImg, r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h); } catch (_) {}
        }
        g.restore();
      }
      if (handImg && visible(hand)) {
        const hr = hand.getBoundingClientRect(), cs = getComputedStyle(hand);
        const w = parseFloat(cs.width) || hr.width, h = parseFloat(cs.height) || hr.height;
        let ang = 0; try { const m = new DOMMatrix(cs.transform); ang = Math.atan2(m.b, m.a); } catch (_) {}
        g.save(); g.translate(hr.left + hr.width / 2, hr.top + hr.height / 2); g.rotate(ang); g.drawImage(handImg, -w / 2, -h / 2, w, h); g.restore();
      }
    };

    if (mode === "fire") face(); // 눈빔: 얼굴이 효과 아래에 깔림
    g.drawImage(cv, 0, 0, W, H);
    if (mode === "slap") face(); // 싸다구: 얼굴 자리는 효과가 비켜감
    g.drawImage(fcv, 0, 0, W, H);

    const word = (txt, x, y, size, fill, stroke, lw, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot || 0);
      g.font = `900 ${size}px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(txt, 0, 0); g.fillStyle = fill; g.fillText(txt, 0, 0); g.restore();
    };
    layer.querySelectorAll(".sc-spam").forEach((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      word(el.textContent, r.left + r.width / 2, r.top + r.height / 2, parseFloat(cs.fontSize), cs.color, "#111", 5, (parseFloat(cs.getPropertyValue("--r")) || 0) * Math.PI / 180);
    });
    layer.querySelectorAll(".sc-orbit b").forEach((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      word(el.textContent, r.left + r.width / 2, r.top + r.height / 2, parseFloat(cs.fontSize), cs.color, "#111", 5);
    });
    const size = parseFloat(getComputedStyle(layer.querySelector(".sc-mega")).fontSize) || 100;
    lines.forEach((t, i) => {
      const y = H / 2 + (i - (lines.length - 1) / 2) * size * 1.05;
      word(t, W / 2 + 6, y + 6, size, "#111", "#111", 8);
      word(t, W / 2, y, size, "#fff", "#e0312b", 10);
    });
    if (nick) {
      const txt = `${nick}님의 ${label}`; g.font = '700 22px "Noto Sans KR",sans-serif';
      const w = g.measureText(txt).width + 28, y = H / 2 + (lines.length / 2) * size * 1.05 + 14;
      g.fillStyle = "#111"; g.beginPath(); g.roundRect(W / 2 - w / 2, y, w, 40, 20); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, W / 2, y + 21);
    }
    g.font = '700 20px "Noto Sans KR",sans-serif'; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(17,17,17,.7)"; g.fillText("뒷공부 근절 캠페인 · dwitgongbu.party", W / 2, H - 16);
    return c;
  }

  const api = { run, choose, prepare, snapshot, isRunning: () => running, modes: Object.keys(MODES) };
  if (typeof module === "object" && module.exports) module.exports = api;
  global.SuperChaos = api;
})(typeof window !== "undefined" ? window : globalThis);
