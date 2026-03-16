import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { env } from './config/env';
import { bigIntReplacer } from './utils/json';
import statsRoute from './api/routes/stats';
import chatRoute from './api/routes/chat';
import agentRoute from './api/routes/agent';
import { AgentService } from './agent/services/AgentService';

const app = new Hono();

// Global Error Handler
app.onError((err, c) => {
  console.error('[Hono Error]:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

// Middleware
app.use('*', logger());
app.use('*', cors());

app.use('*', async (c, next) => {
  console.log(`[Hono] ${c.req.method} ${c.req.url}`);
  await next();
});

app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'POST') {
    try {
      const body = await c.req.raw.clone().json();
      console.log(`[Request] POST /api/chat body:`, JSON.stringify(body, null, 2));
    } catch (e) {}
  }
  await next();
});

// BigInt Serialization Middleware
app.use('*', async (c, next) => {
  await next();
  const contentType = c.res.headers.get('Content-Type');
  if (contentType?.includes('application/json')) {
    try {
      console.log(`[BigInt Middleware] Processing JSON response for ${c.req.path}`);
      const clone = c.res.clone();
      const body = await clone.json();
      c.res = new Response(JSON.stringify(body, bigIntReplacer), {
        headers: c.res.headers,
        status: c.res.status
      });
    } catch (e) {
      console.error(`[BigInt Middleware] JSON parsing error for ${c.req.path}:`, e);
    }
  }
});

// Health Check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API Routes
app.route('/api/stats', statsRoute);
app.route('/api/chat', chatRoute);
app.route('/api/agent', agentRoute);

const port = Number(env.PORT);

// Only start the server if this file is executed directly
const isMain = process.argv[1]?.endsWith('src/index.ts') || 
               process.argv[1]?.endsWith('src/index.js') ||
               process.argv[1]?.endsWith('dist/index.js');

if (isMain) {
  console.log(`🚀 OmniWDK WDK Strategist API starting on port ${port}`);

  serve({
    fetch: app.fetch,
    port
  }, (info) => {
    console.log(`🌍 Server is running on http://localhost:${info.port}`);
    
    // Start the autonomous loop alongside the API
    const INTERVAL = 5 * 60 * 1000;
    console.log('--- Starting Integrated Autonomous Loop (5m interval) ---');
    
    const safeRunCycle = async () => {
      try {
        await AgentService.runCycle();
      } catch (e: any) {
        console.error('Autonomous Loop Error (Non-Fatal):', e.message);
      }
    };

    safeRunCycle();
    setInterval(safeRunCycle, INTERVAL);
  });
}

export default app;
