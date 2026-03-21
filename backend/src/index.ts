import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { pinoLogger } from 'hono-pino';
import { cors } from 'hono/cors';
import { env } from './config/env';
import { bigIntReplacer } from './utils/json';
import statsRoute from './api/routes/stats';
import chatRoute from './api/routes/chat';
import agentRoute from './api/routes/agent';
import dashboardRoute from './api/routes/dashboard';
import robotFleetRoute from './api/routes/robot-fleet';
import x402Route from './api/routes/x402';
import mcpRoute from './api/routes/mcp';
import toolsRoute from './api/routes/tools';
import faucetRoute from './api/routes/faucet';
import { createSecurityMiddleware } from './api/middleware/security';
import { AgentService } from './agent/services/AgentService';
import { startAutonomousLoop } from './agent/AutonomousLoop';
import { validateEnvironment } from './config/security';
import { robotFleetService } from './services/RobotFleetService';
import { logger } from './utils/logger';

const app = new Hono();

// Apply security middleware
createSecurityMiddleware(app);

// Global Error Handler
app.onError((err, c) => {
  logger.error(err, '[Hono Error]');
  return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});

// Middleware
app.use('*', pinoLogger({ 
  pino: logger,
  http: {
    reqId: () => crypto.randomUUID(),
  }
}));
app.use('*', cors());

app.use('/api/chat', async (c, next) => {
  if (c.req.method === 'POST') {
    try {
      const body = await c.req.raw.clone().json();
      logger.debug({ body }, '[Request] POST /api/chat');
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
      const clone = c.res.clone();
      const body = await clone.json();
      c.res = new Response(JSON.stringify(body, bigIntReplacer), {
        headers: c.res.headers,
        status: c.res.status
      });
    } catch (e) {
      logger.error(e, `[BigInt Middleware] JSON parsing error for ${c.req.path}`);
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
app.route('/api/mcp', mcpRoute);
app.route('/api/tools', toolsRoute);
app.route('/api/faucet', faucetRoute);

const port = Number(env.PORT);

// Only start the server if this file is executed directly
const isMain = process.argv[1]?.endsWith('src/index.ts') || 
               process.argv[1]?.endsWith('src/index.js') ||
               process.argv[1]?.endsWith('dist/index.js');

if (isMain) {
  logger.info(`[OmniAgent] WDK Strategist API starting on port ${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0'
  }, async (info) => {
    logger.info(`[Server] Server is running on http://0.0.0.0:${info.port}`);
    
    try {
      await robotFleetService.startSimulator();
    } catch (e) {
      logger.warn(e, '[RobotFleet] Robot fleet simulator failed to start');
    }
    
    try {
      validateEnvironment();
    } catch (e: any) {
      logger.error(e, '[Config] Environment validation failed');
      return;
    }

    if (env.DEPLOYMENT_MODE === 'production') {
      return;
    }

    if (process.env.ALLOW_AGENT_RUN !== 'true') {
      return;
    }
    
    startAutonomousLoop().catch((e: any) => {
      logger.error(e, '[Agent] Failed to start Autonomous Loop');
    });
  });
}

export default app;
