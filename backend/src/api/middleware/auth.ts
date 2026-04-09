import type { MiddlewareHandler } from 'hono';

export const verifyAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, 401);
  }
  
  const token = authHeader.slice(7);
  if (!token || token.length < 10) {
    return c.json({ error: 'Unauthorized: Invalid token' }, 401);
  }
  
  await next();
};