// client/src/utils/apiBase.js
//
// `VITE_API_URL` wins when set (a deployed build pointing at a real API host);
// the default is relative '/api' so local dev goes through Vite's proxy to
// :5000. Same rule fetchElementsByIds.js already applies to its one call --
// centralised here so every other fetch site agrees with it instead of each
// hardcoding a relative '/api' that only resolves on the machine serving the
// API itself.

const DEFAULT_API_URL = '/api';

export function apiBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return DEFAULT_API_URL;
}

export function apiUrl(path) {
  const base = apiBaseUrl();
  const normalisedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalisedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalisedBase}${normalisedPath}`;
}
