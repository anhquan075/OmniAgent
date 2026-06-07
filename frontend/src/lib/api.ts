export const getApiUrl = (path: string): string => {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${normalizedBase}${normalizedPath}`;
};

let csrfToken: string | null = null;
let sessionPromise: Promise<string> | null = null;

export const ensureApiSession = async (): Promise<string> => {
  if (csrfToken) return csrfToken;
  if (sessionPromise) return sessionPromise;

  sessionPromise = fetch(getApiUrl('/api/session'), {
    method: 'GET',
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Unable to initialize API session (${res.status})`);
      }
      const body = await res.json();
      csrfToken = String(body.csrfToken || '');
      if (!csrfToken) {
        throw new Error('API session did not return a CSRF token');
      }
      return csrfToken;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (path.startsWith('/api/') && path !== '/api/session') {
    const token = await ensureApiSession();
    if (!['GET', 'HEAD'].includes(method)) {
      headers.set('X-CSRF-Token', token);
    }
  }

  return fetch(getApiUrl(path), {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
};
