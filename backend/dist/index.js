"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const logger_1 = require("hono/logger");
const cors_1 = require("hono/cors");
const env_1 = require("./config/env");
const json_1 = require("./utils/json");
const stats_1 = __importDefault(require("./api/routes/stats"));
const chat_1 = __importDefault(require("./api/routes/chat"));
const agent_1 = __importDefault(require("./api/routes/agent"));
const AgentService_1 = require("./agent/services/AgentService");
const app = new hono_1.Hono();
// Global Error Handler
app.onError((err, c) => {
    console.error('[Hono Error]:', err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});
// Middleware
app.use('*', (0, logger_1.logger)());
app.use('*', (0, cors_1.cors)());
app.use('*', async (c, next) => {
    console.log(`[Hono] ${c.req.method} ${c.req.url}`);
    await next();
});
app.use('/api/chat', async (c, next) => {
    if (c.req.method === 'POST') {
        try {
            const body = await c.req.raw.clone().json();
            console.log(`[Request] POST /api/chat body:`, JSON.stringify(body, null, 2));
        }
        catch (e) { }
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
            c.res = new Response(JSON.stringify(body, json_1.bigIntReplacer), {
                headers: c.res.headers,
                status: c.res.status
            });
        }
        catch (e) {
            console.error(`[BigInt Middleware] JSON parsing error for ${c.req.path}:`, e);
        }
    }
});
// Health Check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
// API Routes
app.route('/api/stats', stats_1.default);
app.route('/api/chat', chat_1.default);
app.route('/api/agent', agent_1.default);
const port = Number(env_1.env.PORT);
// Only start the server if this file is executed directly
const isMain = process.argv[1]?.endsWith('src/index.ts') ||
    process.argv[1]?.endsWith('src/index.js') ||
    process.argv[1]?.endsWith('dist/index.js');
if (isMain) {
    console.log(`🚀 OmniWDK WDK Strategist API starting on port ${port}`);
    (0, node_server_1.serve)({
        fetch: app.fetch,
        port
    }, (info) => {
        console.log(`🌍 Server is running on http://localhost:${info.port}`);
        // Start the autonomous loop alongside the API
        const INTERVAL = 5 * 60 * 1000;
        console.log('--- Starting Integrated Autonomous Loop (5m interval) ---');
        const safeRunCycle = async () => {
            try {
                await AgentService_1.AgentService.runCycle();
            }
            catch (e) {
                console.error('Autonomous Loop Error (Non-Fatal):', e.message);
            }
        };
        safeRunCycle();
        setInterval(safeRunCycle, INTERVAL);
    });
}
exports.default = app;
