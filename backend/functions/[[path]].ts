/**
 * Cloudflare Pages Function Entry Point
 * Handles all API routes for OmniAgent backend
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import statsRoute from '../src/api/routes/stats';
import chatRoute from '../src/api/routes/chat';
import agentRoute from '../src/api/routes/agent';
import dashboardRoute from '../src/api/routes/dashboard';
import robotFleetRoute from '../src/api/routes/robot-fleet';
import x402Route from '../src/api/routes/x402';
import mcpRoute from '../src/api/routes/mcp';

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

app.route('/api/stats', statsRoute);
app.route('/api/chat', chatRoute);
app.route('/api/agent', agentRoute);
app.route('/api/dashboard', dashboardRoute);
app.route('/api/robot-fleet', robotFleetRoute);
app.route('/api/x402', x402Route);
app.route('/api/mcp', mcpRoute);

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export const onRequest = app.fetch;
