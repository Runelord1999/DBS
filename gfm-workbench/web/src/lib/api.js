import { demoRequest } from '@demo';

const TOKEN_KEY = 'gfm-workbench-token';

/**
 * The static demo build has no server: requests are dispatched against the real
 * route modules running in the browser over a wasm SQLite database. Everything
 * above this file — every screen, every call — is identical either way.
 */
export const IS_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/**
 * The session token is the only thing kept in browser storage. All portfolio
 * data lives in the server database — nothing here is a local data store
 * (Build Brief Section 0).
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function raise(status, payload) {
  throw new ApiError(
    status,
    payload?.error || `Request failed (${status})`,
    payload?.details || payload?.breaches || null
  );
}

async function request(method, path, body) {
  if (IS_DEMO) {
    const res = await demoRequest(method, path, body);
    if (res.status >= 400) raise(res.status, res.body);
    return res.body;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('gfm-unauthorized'));
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

  if (!res.ok) raise(res.status, payload);
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filenameFrom(disposition, fallback) {
  const match = String(disposition || '').match(/filename="([^"]+)"/);
  return match ? match[1] : fallback;
}

/** Triggers a CSV download. Exports work in the demo too — same route code. */
export async function downloadCsv(path, fallbackName) {
  if (IS_DEMO) {
    const res = await demoRequest('GET', path);
    if (res.status >= 400) raise(res.status, res.body);
    saveBlob(
      new Blob([res.body], { type: 'text/csv;charset=utf-8' }),
      filenameFrom(res.headers?.['content-disposition'], fallbackName)
    );
    return;
  }

  const res = await fetch(`/api${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  saveBlob(await res.blob(), filenameFrom(res.headers.get('content-disposition'), fallbackName));
}
