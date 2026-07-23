import { describe, expect, it, vi } from "vitest";

import { fetchUpstreamWithRetry, shouldStreamUpstream } from "./server-proxy.mjs";

function timeoutError() {
  const error = new TypeError("fetch failed");
  error.cause = { code: "ETIMEDOUT" };
  return error;
}

describe("shouldStreamUpstream", () => {
  it("streams the dashboard SSE path", () => {
    expect(shouldStreamUpstream("/api/dashboard/stream")).toBe(true);
    expect(shouldStreamUpstream("/api/dashboard/snapshot")).toBe(false);
  });

  it("streams event-stream content types", () => {
    expect(shouldStreamUpstream("/api/other", "text/event-stream; charset=utf-8")).toBe(true);
    expect(shouldStreamUpstream("/api/other", "application/json")).toBe(false);
  });
});

describe("fetchUpstreamWithRetry", () => {
  it("retries an idempotent request after a transient connection failure", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }));
    const onRetry = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await fetchUpstreamWithRetry("http://backend.test/api/health", { method: "GET" }, {
      fetchImpl,
      maxAttempts: 3,
      onRetry,
      retryDelayMs: 10,
      sleep,
      timeoutMs: 100,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      maxAttempts: 3,
      reason: "ETIMEDOUT",
    }));
  });

  it("does not retry a non-idempotent request", async () => {
    const error = timeoutError();
    const fetchImpl = vi.fn().mockRejectedValue(error);

    await expect(fetchUpstreamWithRetry("http://backend.test/api/run", { method: "POST" }, {
      fetchImpl,
      maxAttempts: 3,
      retryDelayMs: 0,
      timeoutMs: 100,
    })).rejects.toBe(error);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a temporary upstream gateway response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchUpstreamWithRetry("http://backend.test/api/health", { method: "HEAD" }, {
      fetchImpl,
      maxAttempts: 2,
      retryDelayMs: 0,
      timeoutMs: 100,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
