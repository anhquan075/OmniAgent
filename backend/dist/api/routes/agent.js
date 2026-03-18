"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const streaming_1 = require("hono/streaming");
const env_1 = require("@/config/env");
const AgentService_1 = require("@/agent/services/AgentService");
const crypto_1 = __importDefault(require("crypto"));
const events_1 = require("events");
const AutonomousLoop_1 = require("@/agent/AutonomousLoop");
const logger_1 = require("@/utils/logger");
const agent = new hono_1.Hono();
const agentEvents = new events_1.EventEmitter();
let agentHistory = [];
// Webhook signature verification helper
const verifySignature = (payload, signature) => {
    const secret = env_1.env.GITHUB_WEBHOOK_SECRET;
    if (!secret)
        return true; // Dev fallback
    if (!signature)
        return false;
    const hmac = crypto_1.default.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    }
    catch (e) {
        return false;
    }
};
// SSE Stream for Agent Brain
agent.get('/stream', (c) => {
    logger_1.logger.info('[Agent] Client connected to agent stream');
    return (0, streaming_1.stream)(c, async (stream) => {
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');
        // Send history immediately
        await stream.write(`data: ${JSON.stringify({ type: 'history', data: agentHistory })}\n\n`);
        const listener = (event) => {
            stream.write(`data: ${JSON.stringify({ type: 'event', data: event })}\n\n`);
        };
        agentEvents.on('agent-update', listener);
        // Keep-alive heartbeat
        const interval = setInterval(() => {
            stream.write(': heartbeat\n\n');
        }, 15000);
        // Clean up on disconnect
        c.req.raw.signal.addEventListener('abort', () => {
            logger_1.logger.info('[Agent] Client disconnected from stream');
            agentEvents.off('agent-update', listener);
            clearInterval(interval);
        });
        // Keep the stream open
        while (!c.req.raw.signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    });
});
// Reporting endpoint (for the loop to send updates)
agent.post('/report', async (c) => {
    const body = await c.req.json();
    logger_1.logger.debug({ node: body.node, action: body.action }, '[Agent] Received report');
    const event = {
        ...body,
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    agentHistory.push(event);
    if (agentHistory.length > 100)
        agentHistory.shift();
    agentEvents.emit('agent-update', event);
    logger_1.logger.debug('[Agent] Report emitted to listeners');
    return c.text('OK');
});
// Webhook receiver
agent.post('/webhook', async (c) => {
    const signature = c.req.header('x-hub-signature-256');
    const eventName = c.req.header('x-github-event');
    const rawBody = await c.req.text();
    logger_1.logger.info({ event: eventName }, '[Webhook] Received event');
    if (!verifySignature(rawBody, signature)) {
        logger_1.logger.warn('[Webhook] Invalid signature');
        return c.text('Invalid signature', 401);
    }
    const payload = JSON.parse(rawBody);
    logger_1.logger.info({ event: eventName, action: payload.action }, '[Webhook] Processing event');
    // Trigger rebalance on specific events
    let shouldTrigger = false;
    if (eventName === 'pull_request' && payload.pull_request?.merged)
        shouldTrigger = true;
    if (eventName === 'issues' && payload.issue?.state === 'closed')
        shouldTrigger = true;
    if (eventName === 'push')
        shouldTrigger = true;
    if (shouldTrigger) {
        AgentService_1.AgentService.runCycle().catch(e => logger_1.logger.error(e, '[Webhook] Rebalance trigger failed'));
        return c.json({ success: true, message: 'Autonomous cycle triggered' });
    }
    return c.json({ success: true, message: 'Event logged' });
});
let cronExecutionCount = 0;
let lastCronTime = null;
agent.post('/run-cycle', async (c) => {
    const secret = env_1.env.AGENT_CRON_SECRET;
    if (secret && c.req.header('x-cron-secret') !== secret) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
        cronExecutionCount++;
        lastCronTime = new Date().toISOString();
        const result = await (0, AutonomousLoop_1.runAutonomousCycle)();
        return c.json({
            success: true,
            summary: result.text?.slice(0, 500),
            nextRunDelay: result.nextRunDelay,
            schedulingReason: result.schedulingReason,
        });
    }
    catch (e) {
        logger_1.logger.error(e, '[RunCycle] Cron-triggered cycle failed');
        return c.json({ success: false, error: e.message }, 500);
    }
});
agent.get('/cron-status', (c) => {
    return c.json({
        totalExecutions: cronExecutionCount,
        lastExecution: lastCronTime,
        uptime: process.uptime(),
    });
});
exports.default = agent;
