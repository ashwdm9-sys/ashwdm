// 백엔드(서버) 주소.
// - GitHub Pages 주소에서는 Render 서버를 가리킵니다.
// - 서버가 화면까지 같이 서빙하는 곳(Render 주소, dwitgongbu.party, 로컬 npm start)에서는 비워두면 같은 주소의 서버를 씁니다.
window.DGB_API_BASE = location.hostname.endsWith('github.io') ? 'https://dwitgongbu-timer.onrender.com' : '';
