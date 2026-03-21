"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const hono_pino_1 = require("hono-pino");
const cors_1 = require("hono/cors");
const env_1 = require("./config/env");
const json_1 = require("./utils/json");
const stats_1 = __importDefault(require("./api/routes/stats"));
const chat_1 = __importDefault(require("./api/routes/chat"));
const agent_1 = __importDefault(require("./api/routes/agent"));
const dashboard_1 = __importDefault(require("./api/routes/dashboard"));
const robot_fleet_1 = __importDefault(require("./api/routes/robot-fleet"));
const x402_1 = __importDefault(require("./api/routes/x402"));
const mcp_1 = __importDefault(require("./api/routes/mcp"));
const tools_1 = __importDefault(require("./api/routes/tools"));
const faucet_1 = __importDefault(require("./api/routes/faucet"));
const security_1 = require("./api/middleware/security");
const AutonomousLoop_1 = require("./agent/AutonomousLoop");
const security_2 = require("./config/security");
const RobotFleetService_1 = require("./services/RobotFleetService");
const logger_1 = require("./utils/logger");
const app = new hono_1.Hono();
app.use('*', (0, cors_1.cors)({
    origin: (origin) => {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:5176',
            'https://omni-wdk.vercel.app',
        ];
        if (!origin)
            return '*';
        return allowedOrigins.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposeHeaders: ['Content-Length', 'X-Request-ID'],
    maxAge: 86400,
    credentials: true,
}));
(0, security_1.createSecurityMiddleware)(app);
// Global Error Handler
app.onError((err, c) => {
    logger_1.logger.error(err, '[Hono Error]');
    return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});
// Middleware
app.use('*', (0, hono_pino_1.pinoLogger)({
    pino: logger_1.logger,
    http: {
        reqId: () => crypto.randomUUID(),
    }
}));
app.use('/api/chat', async (c, next) => {
    if (c.req.method === 'POST') {
        try {
            const body = await c.req.raw.clone().json();
            logger_1.logger.debug({ body }, '[Request] POST /api/chat');
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
            const clone = c.res.clone();
            const body = await clone.json();
            c.res = new Response(JSON.stringify(body, json_1.bigIntReplacer), {
                headers: c.res.headers,
                status: c.res.status
            });
        }
        catch (e) {
            logger_1.logger.error(e, `[BigInt Middleware] JSON parsing error for ${c.req.path}`);
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
app.route('/api/mcp', mcp_1.default);
app.route('/api/tools', tools_1.default);
app.route('/api/faucet', faucet_1.default);
const port = Number(env_1.env.PORT);
// Only start the server if this file is executed directly
const isMain = process.argv[1]?.endsWith('src/index.ts') ||
    process.argv[1]?.endsWith('src/index.js') ||
    process.argv[1]?.endsWith('dist/index.js');
if (isMain) {
    logger_1.logger.info(`[OmniAgent] WDK Strategist API starting on port ${port}`);
    (0, node_server_1.serve)({
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0'
    }, async (info) => {
        logger_1.logger.info(`[Server] Server is running on http://0.0.0.0:${info.port}`);
        try {
            await RobotFleetService_1.robotFleetService.startSimulator();
        }
        catch (e) {
            logger_1.logger.warn(e, '[RobotFleet] Robot fleet simulator failed to start');
        }
        try {
            (0, security_2.validateEnvironment)();
        }
        catch (e) {
            logger_1.logger.error(e, '[Config] Environment validation failed');
            return;
        }
        if (env_1.env.DEPLOYMENT_MODE === 'production') {
            return;
        }
        if (process.env.ALLOW_AGENT_RUN !== 'true') {
            return;
        }
        (0, AutonomousLoop_1.startAutonomousLoop)().catch((e) => {
            logger_1.logger.error(e, '[Agent] Failed to start Autonomous Loop');
        });
    });
}
exports.default = app;
