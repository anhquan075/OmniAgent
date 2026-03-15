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

// Middleware
app.use('*', logger());
app.use('*', cors());

// BigInt Serialization Middleware
app.use('*', async (c, next) => {
  await next();
  if (c.res.headers.get('Content-Type')?.includes('application/json')) {
    try {
      const clone = c.res.clone();
      const body = await clone.json();
      c.res = new Response(JSON.stringify(body, bigIntReplacer), {
        headers: c.res.headers,
        status: c.res.status
      });
    } catch (e) {
      console.error('JSON parsing error in middleware:', e);
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
if (import.meta.url.endsWith('src/index.ts') || import.meta.url.endsWith('src/index.js')) {
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
