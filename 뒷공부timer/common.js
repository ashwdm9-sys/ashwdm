export const $ = (selector, root = document) => root.querySelector(selector);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export function toast(message, ms = 2600) {
  const node = el('div', { class: 'toast' }, message);
  $('#toasts').append(node);
  setTimeout(() => node.remove(), ms);
}

// localStorage 는 사생활 보호 모드 등에서 막힐 수 있다
export const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 저장 못 해도 동작에는 지장 없음
    }
  },
};

export const API_BASE = String(window.DGB_API_BASE || '').replace(/\/+$/, '');
// GitHub Pages에는 서버가 없으므로 서버 주소가 비어 있으면 아무것도 동작하지 않는다
export const noBackend = !API_BASE && location.hostname.endsWith('github.io');
export const wsUrl = () =>
  API_BASE
    ? API_BASE.replace(/^http/, 'ws') + '/ws'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export async function api(path, options = {}) {
  if (noBackend) throw new Error('서버 주소가 설정되지 않았습니다. config.js 를 확인하세요.');
  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || '요청에 실패했습니다.');
    error.code = data.code;
    throw error;
  }
  return data;
}

export const won = (amount) => amount.toLocaleString('ko-KR') + '원';

export function ago(timestamp, now = Date.now()) {
  const minutes = Math.floor((now - timestamp) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
