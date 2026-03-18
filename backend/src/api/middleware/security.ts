import { Hono } from 'hono';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import * as jose from 'jose';

type Cache = {
  ip: string;
  count: number;
  resetTime: number;
};

const rateLimitCache = new Map<string, Cache>();

function cleanupRateLimitCache() {
  const now = Date.now();
  for (const [ip, data] of rateLimitCache.entries()) {
    if (now > data.resetTime) {
      rateLimitCache.delete(ip);
    }
  }
}

setInterval(cleanupRateLimitCache, 60000);

function getRateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const PUBLIC_ENDPOINTS = [
  '/health',
  '/api/stats',
  '/api/mcp',
];

const PROTECTED_ENDPOINTS = [
  '/api/chat',
  '/api/agent/run-cycle',
  '/api/agent/webhook',
  '/api/robot-fleet',
];

let jwtSecret: jose.KeyLike | undefined;

async function getJWTSecret(): Promise<jose.KeyLike | undefined> {
  if (jwtSecret) return jwtSecret;
  
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
    return jwtSecret;
  }
  
  if (!env.JWT_SECRET) {
    logger.debug('[Security] JWT_SECRET not configured');
  } else {
    logger.warn('[Security] JWT_SECRET too short (min 32 chars)');
  }
  return undefined;
}

export interface JWTPayload {
  sub: string;
  iat?: number;
  exp?: number;
  roles?: string[];
  permissions?: string[];
}

export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string | null> {
  const secret = await getJWTSecret();
  if (!secret) {
    logger.warn('[JWT] Cannot create token - no valid secret');
    return null;
  }
  
  const token = await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  
  return token;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  const secret = await getJWTSecret();
  if (!secret) {
    logger.warn('[JWT] Cannot verify token - no valid secret');
    return null;
  }
  
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as JWTPayload;
  } catch (error) {
    logger.debug({ error: (error as Error).message }, '[JWT] Token verification failed');
    return null;
  }
}

export function createRateLimiter(limit: number, windowMs: number) {
  return async (c: any, next: () => Promise<void>) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
    const endpoint = c.req.path;
    const key = getRateLimitKey(ip, endpoint);
    
    const now = Date.now();
    let record = rateLimitCache.get(key);
    
    if (!record || now > record.resetTime) {
      record = { ip, count: 0, resetTime: now + windowMs };
      rateLimitCache.set(key, record);
    }
    
    record.count++;
    
    if (record.count > limit) {
      logger.warn({ ip, endpoint, count: record.count }, '[Security] Rate limit exceeded');
      return c.json({ 
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      }, 429, {
        'Retry-After': String(Math.ceil((record.resetTime - now) / 1000)),
      });
    }
    
    c.set('rateLimitRemaining', limit - record.count);
    await next();
  };
}

export function securityHeaders() {
  return async (c: any, next: () => Promise<void>) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      c.res.headers.set(header, value);
    }
    await next();
  };
}

export function validateJWT() {
  return async (c: any, next: () => Promise<void>) => {
    const path = c.req.path;
    
    const isPublic = PUBLIC_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
    if (isPublic) {
      return await next();
    }
    
    const isProtected = PROTECTED_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
    if (!isProtected) {
      return await next();
    }
    
    const jwtSecret = await getJWTSecret();
    if (!jwtSecret) {
      logger.debug('[Security] JWT_SECRET not configured, skipping JWT validation');
      return await next();
    }
    
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      logger.warn({ path, ip: c.req.header('CF-Connecting-IP') }, '[Security] Missing Authorization header');
      return c.json({ error: 'Unauthorized', message: 'Authorization header required' }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      logger.warn({ path, ip: c.req.header('CF-Connecting-IP') }, '[Security] Missing token');
      return c.json({ error: 'Unauthorized', message: 'Token required' }, 401);
    }
    
    const payload = await verifyToken(token);
    if (!payload) {
      logger.warn({ path, ip: c.req.header('CF-Connecting-IP') }, '[Security] Invalid or expired token');
      return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
    }
    
    c.set('jwtPayload', payload);
    c.set('userId', payload.sub);
    
    await next();
  };
}

export function inputSanitizer() {
  return async (c: any, next: () => Promise<void>) => {
    if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'PATCH') {
      try {
        const contentType = c.req.header('Content-Type') || '';
        
        if (contentType.includes('application/json')) {
          const body = await c.req.json().catch(() => ({}));
          const sanitized = sanitizeObject(body);
          
          c.req.json = () => Promise.resolve(sanitized);
          c.req.raw.json = () => Promise.resolve(sanitized);
        }
      } catch (e) {
        logger.debug('[Security] Could not sanitize input');
      }
    }
    
    await next();
  };
}

export function errorSanitizer() {
  return async (c: any, next: () => Promise<void>) => {
    await next();
    
    if (c.res.status >= 500) {
      c.res.headers.set('Content-Type', 'application/json');
      c.res = new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

export function requestLogger() {
  return async (c: any, next: () => Promise<void>) => {
    const start = Date.now();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
    const method = c.req.method;
    const path = c.req.path;
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    if (status >= 400) {
      logger.warn({ ip, method, path, status, duration }, '[Request] Error response');
    } else {
      logger.debug({ ip, method, path, status, duration }, '[Request] Completed');
    }
  };
}

export function createSecurityMiddleware(app: Hono) {
  app.use('*', securityHeaders());
  app.use('*', createRateLimiter(100, 60000));
  app.use('*', inputSanitizer());
  app.use('*', errorSanitizer());
  app.use('*', requestLogger());
  app.use('*', validateJWT());
  
  logger.info('[Security] Middleware applied with JWT auth');
}
