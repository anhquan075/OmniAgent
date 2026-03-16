import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { env } from './config/env';
import { bigIntReplacer } from './utils/json';
import statsRoute from './api/routes/stats';
import chatRoute from './api/routes/chat';
import agentRoute from './api/routes/agent';
import dashboardRoute from './api/routes/dashboard';
import robotFleetRoute from './api/routes/robot-fleet';
import x402Route from './api/routes/x402';
import { AgentService } from './agent/services/AgentService';
import { startAutonomousLoop } from './agent/AutonomousLoop';
import { validateEnvironment } from './config/security';
import { robotFleetService } from './services/RobotFleetService';

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
app.route('/api/dashboard', dashboardRoute);
app.route('/api/robot-fleet', robotFleetRoute);
app.route('/api/x402', x402Route);

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
  }, async (info) => {
    console.log(`🌍 Server is running on http://localhost:${info.port}`);
    
    // Start robot fleet simulator
    try {
      await robotFleetService.startSimulator();
      console.log('🤖 Robot Fleet Simulator started successfully');
    } catch (e) {
      console.warn('⚠️  Robot fleet simulator failed to start:', e);
    }
    
    // Validate critical environment variables before starting agent
    try {
      validateEnvironment();
    } catch (e: any) {
      console.error('❌ Environment validation failed:', e.message);
      console.warn('⚠️  Autonomous Agent Loop will NOT start due to missing/invalid secrets');
      return;
    }

    // Check if autonomous loop is explicitly allowed
    if (process.env.ALLOW_AGENT_RUN !== 'true') {
      console.warn('⚠️  Autonomous Agent Loop skipped (ALLOW_AGENT_RUN not set)');
      console.warn('    To enable the autonomous agent, set ALLOW_AGENT_RUN=true in your environment');
      return;
    }
    
    // Start the autonomous loop alongside the API
    console.log('--- Starting Integrated Autonomous Loop (Dynamic Scheduling) ---');
    
    startAutonomousLoop().catch((e: any) => {
      console.error('Failed to start Autonomous Loop:', e);
    });
  });
}

export default app;
