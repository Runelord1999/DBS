const TOKEN_KEY = 'gfm-workbench-token';

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

async function request(method, path, body) {
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

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.error || `Request failed (${res.status})`,
      payload?.details || payload?.breaches || null
    );
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

/** Triggers a CSV download through the authenticated API. */
export async function downloadCsv(path, fallbackName) {
  const res = await fetch(`/api${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');

  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match ? match[1] : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
