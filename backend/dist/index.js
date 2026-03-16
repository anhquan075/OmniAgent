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
const dashboard_1 = __importDefault(require("./api/routes/dashboard"));
const robot_fleet_1 = __importDefault(require("./api/routes/robot-fleet"));
const x402_1 = __importDefault(require("./api/routes/x402"));
const AutonomousLoop_1 = require("./agent/AutonomousLoop");
const security_1 = require("./config/security");
const RobotFleetService_1 = require("./services/RobotFleetService");
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
app.route('/api/dashboard', dashboard_1.default);
app.route('/api/robot-fleet', robot_fleet_1.default);
app.route('/api/x402', x402_1.default);
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
    }, async (info) => {
        console.log(`🌍 Server is running on http://localhost:${info.port}`);
        // Start robot fleet simulator
        try {
            await RobotFleetService_1.robotFleetService.startSimulator();
            console.log('🤖 Robot Fleet Simulator started successfully');
        }
        catch (e) {
            console.warn('⚠️  Robot fleet simulator failed to start:', e);
        }
        // Validate critical environment variables before starting agent
        try {
            (0, security_1.validateEnvironment)();
        }
        catch (e) {
            console.error('❌ Environment validation failed:', e.message);
            console.warn('⚠️  Autonomous Agent Loop will NOT start due to missing/invalid secrets');
            return;
        }
        if (env_1.env.DEPLOYMENT_MODE === 'production') {
            console.log('☁️  Production mode: autonomous loop disabled (use POST /api/agent/run-cycle via cron)');
            return;
        }
        if (process.env.ALLOW_AGENT_RUN !== 'true') {
            console.warn('⚠️  Autonomous Agent Loop skipped (ALLOW_AGENT_RUN not set)');
            return;
        }
        console.log('--- Starting Integrated Autonomous Loop (Dynamic Scheduling) ---');
        (0, AutonomousLoop_1.startAutonomousLoop)().catch((e) => {
            console.error('Failed to start Autonomous Loop:', e);
        });
    });
}
exports.default = app;
