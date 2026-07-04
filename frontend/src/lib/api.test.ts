import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiEventSource, apiFetch, resetApiSession } from './api';

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

  it('initializes a frontend session before opening dashboard event streams', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'stream-token', expiresAt: 60_000 }));
    const sources: Array<{ url: string; init?: EventSourceInit }> = [];
    class FakeEventSource {
      url: string;

      init?: EventSourceInit;

      constructor(url: string, init?: EventSourceInit) {
        this.url = url;
        this.init = init;
        sources.push({ url, init });
      }

      close = vi.fn();
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);

    const source = await apiEventSource('/api/dashboard/stream?limit=8');

    expect(source).toBeInstanceOf(FakeEventSource);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/session');
    expect(sources).toEqual([
      { url: '/api/dashboard/stream?limit=8', init: { withCredentials: true } },
    ]);
  });
});
