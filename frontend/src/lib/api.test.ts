import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, resetApiSession } from './api';

const jsonResponse = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('apiFetch', () => {
  beforeEach(() => {
    resetApiSession();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refreshes the frontend session and retries once after an authenticated API 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'first-token' }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'second-token' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/dashboard/snapshot?limit=10');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/session',
      '/api/dashboard/snapshot?limit=10',
      '/api/session',
      '/api/dashboard/snapshot?limit=10',
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ credentials: 'include' });
  });

  it('refreshes an expired session before dashboard polling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'first-token', expiresAt: 30_000 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'first' }))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'second-token', expiresAt: 80_000 }))
      .mockResolvedValueOnce(jsonResponse({ status: 'second' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/dashboard/snapshot?limit=10');
    vi.setSystemTime(30_500);
    const response = await apiFetch('/api/dashboard/snapshot?limit=10');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/session',
      '/api/dashboard/snapshot?limit=10',
      '/api/session',
      '/api/dashboard/snapshot?limit=10',
    ]);
  });
});
