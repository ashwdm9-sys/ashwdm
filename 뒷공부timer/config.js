// 백엔드(서버) 주소.
// - GitHub Pages 주소에서는 Render 서버를 가리킵니다.
// - 서버가 화면까지 같이 서빙하는 곳(Render 주소, dwitgongbu.party, 로컬 npm start)에서는 비워두면 같은 주소의 서버를 씁니다.
window.DGB_API_BASE = location.hostname.endsWith('github.io') ? 'https://dwitgongbu-timer.onrender.com' : '';

// 초대 링크로 공유하는 주소. 링크 미리보기(카톡 등)는 서버가 만들어 주므로 서버가 화면을 서빙하는 주소여야 합니다.
// 비워두면 지금 보고 있는 주소를 씁니다.
window.DGB_SHARE_BASE = location.hostname.endsWith('github.io') ? 'https://dwitgongbu.party' : '';
