# 뒷공부 근절 캠페인

서로의 뒷공부를 감시하는 실시간 타이머. 방을 만들고 링크를 뿌리면 같은 방 사람끼리 얼굴과 뒷공부 시간을 서로 감시합니다.

## 구조

| 위치 | 역할 |
| --- | --- |
| 이 폴더 (`index.html`, `donate.html`, `*.js`, `styles.css`) | 화면. 정적 파일이라 GitHub Pages에 올릴 수 있음 |
| `server/` | 방 동기화(WebSocket)와 결제 승인을 맡는 Node 서버. Pages에서는 못 돌리므로 따로 배포 |

화면은 `config.js`의 `DGB_API_BASE`에 적힌 서버와 통신합니다.

## 로컬 실행

```
cd server
npm install
npm start
```

`http://localhost:3000` 접속. Node 20.12 이상 필요. 이때는 `config.js`를 비워두면 됩니다.

## GitHub Pages 배포

1. `server/`를 Node를 돌릴 수 있는 곳에 배포합니다 (Render, Railway 등). https 주소가 나와야 합니다.
   - Root Directory: `뒷공부timer/server`, Build: `npm install`, Start: `npm start`
   - 환경변수: `ALLOWED_ORIGINS=https://ashwdm9-sys.github.io`, 그리고 토스 키(`TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`)
2. `config.js`의 `window.DGB_API_BASE`에 그 서버 주소를 넣고 커밋/푸시합니다.
3. https://ashwdm9-sys.github.io/ashwdm/뒷공부timer/ 로 접속합니다.

무료 서버는 한동안 요청이 없으면 잠들었다가 첫 접속에 수십 초 걸릴 수 있습니다.

## 후원(결제)

토스페이먼츠 연동. 기본값은 테스트 키라 실제 출금은 없습니다. 실결제는 `server/.env.example`을 `.env`로 복사해 라이브 키(`live_ck_`, `live_sk_`)를 넣으세요. 시크릿 키는 서버 환경변수에만 두고 저장소에 올리지 마세요.
