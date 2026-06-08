import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const distDir = resolve("dist");
const backendUrl = normalizeBackendUrl(process.env.BACKEND_INTERNAL_URL || process.env.BACKEND_URL || "");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "server",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function normalizeBackendUrl(value) {
  if (!value) {
    throw new Error("BACKEND_URL or BACKEND_INTERNAL_URL must be set for the frontend API proxy.");
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.endsWith("/") ? withScheme.slice(0, -1) : withScheme;
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

function copyProxyHeaders(source, res) {
  for (const [key, value] of source.entries()) {
    const lowerKey = key.toLowerCase();
    if (hopByHopHeaders.has(lowerKey)) continue;
    res.setHeader(key, value);
  }
}

function getRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyApi(req, res, url) {
  const targetUrl = `${backendUrl}${url.pathname}${url.search}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || hopByHopHeaders.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  headers.set("x-forwarded-host", req.headers.host || "");
  headers.set("x-forwarded-proto", "https");

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: await getRequestBody(req),
  });

  res.statusCode = upstream.status;
  copyProxyHeaders(upstream.headers, res);
  res.setHeader("Cache-Control", "no-store");
  setSecurityHeaders(res);
  const body = Buffer.from(await upstream.arrayBuffer());
  res.end(body);
}

function safeStaticPath(pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(distDir, normalized));
  return absolutePath.startsWith(distDir) ? absolutePath : null;
}

async function serveStatic(req, res, url) {
  const filePath = safeStaticPath(url.pathname);
  const fileExists = filePath && existsSync(filePath) && statSync(filePath).isFile();
  if (!fileExists && extname(url.pathname)) {
    setSecurityHeaders(res);
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }
  const fallbackPath = join(distDir, "index.html");
  const resolvedPath = fileExists ? filePath : fallbackPath;
  const ext = extname(resolvedPath);

  setSecurityHeaders(res);
  res.setHeader("Content-Type", mimeTypes.get(ext) || "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    resolvedPath.includes(`${distDir}/assets/`) ? "public, max-age=31536000, immutable" : "no-store",
  );

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.end();
    return;
  }

  createReadStream(resolvedPath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await proxyApi(req, res, url);
      return;
    }
    if (url.pathname.endsWith(".map") || url.pathname.startsWith("/src/")) {
      setSecurityHeaders(res);
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    setSecurityHeaders(res);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "frontend_proxy_error" }));
    console.error(error);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`frontend server listening on ${port}`);
});
