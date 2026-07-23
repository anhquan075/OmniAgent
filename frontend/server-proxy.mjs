const retryableMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const retryableStatuses = new Set([502, 503, 504]);

const defaultSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function proxyRetryConfigFromEnv(env = process.env) {
  return {
    maxAttempts: positiveInteger(env.FRONTEND_UPSTREAM_MAX_ATTEMPTS, 3),
    retryDelayMs: nonNegativeInteger(env.FRONTEND_UPSTREAM_RETRY_DELAY_MS, 250),
    timeoutMs: positiveInteger(env.FRONTEND_UPSTREAM_TIMEOUT_MS, 20_000),
  };
}

export function upstreamErrorReason(error) {
  return error?.cause?.code || error?.code || error?.name || "upstream_fetch_failed";
}

async function fetchWithTimeout(fetchImpl, targetUrl, init, timeoutMs) {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await fetchImpl(targetUrl, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchUpstreamWithRetry(targetUrl, init = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxAttempts = positiveInteger(options.maxAttempts, 3);
  const retryDelayMs = nonNegativeInteger(options.retryDelayMs, 250);
  const sleep = options.sleep || defaultSleep;
  const timeoutMs = positiveInteger(options.timeoutMs, 20_000);
  const method = String(init.method || "GET").toUpperCase();
  const attempts = retryableMethods.has(method) ? maxAttempts : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, targetUrl, init, timeoutMs);
      if (!retryableStatuses.has(response.status) || attempt === attempts) {
        return response;
      }

      await response.body?.cancel();
      options.onRetry?.({
        attempt,
        maxAttempts: attempts,
        reason: `HTTP_${response.status}`,
      });
    } catch (error) {
      if (attempt === attempts) throw error;
      options.onRetry?.({
        attempt,
        maxAttempts: attempts,
        reason: upstreamErrorReason(error),
      });
    }

    await sleep(retryDelayMs * attempt);
  }

  throw new Error("frontend_proxy_retry_exhausted");
}
