"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const streaming_1 = require("hono/streaming");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const AgentService_1 = require("../../agent/services/AgentService");
const crypto_1 = __importDefault(require("crypto"));
const events_1 = require("events");
const AutonomousLoop_1 = require("../../agent/AutonomousLoop");
const logger_1 = require("../../utils/logger");
const agent = new hono_1.Hono();
const agentEvents = new events_1.EventEmitter();
let agentHistory = [];
// Tool quality validation: map operations to expected tool categories
const TOOL_CATEGORIES = {
    'get_vault_status': ['get_vault_status', 'wdk_vault_get_state', 'wdk_vault_get_balance'],
    'get_balances': ['get_all_chain_balances', 'sepolia_get_balance', 'sol_get_balance', 'ton_get_balance'],
    'analyze_risk': ['analyze_risk', 'wdk_engine_get_risk_metrics'],
    'rebalance': ['execute_rebalance', 'wdk_engine_execute_cycle'],
    'bridge': ['check_cross_chain_yields', 'bridge_via_layerzero', 'sepolia_bridge_layerzero'],
    'supply': ['supply_to_aave', 'sepolia_supply_aave'],
    'withdraw': ['withdraw_from_aave', 'sepolia_withdraw_aave'],
    'swap': ['sepolia_swap', 'sol_swap'],
    'transfer': ['sepolia_transfer', 'sol_transfer', 'ton_transfer'],
    'deposit': ['wdk_vault_deposit'],
    'withdraw_vault': ['wdk_vault_withdraw'],
    'yield_sweep': ['yield_sweep'],
    'mint_token': ['wdk_mint_test_token'],
    'create_wallet': ['sepolia_create_wallet', 'sol_create_wallet', 'ton_create_wallet'],
};
// Quality check schema
const qualityCheckSchema = zod_1.z.object({
    operation: zod_1.z.string().describe('The intended operation (e.g., "get_vault_status", "rebalance")'),
    expectedTools: zod_1.z.array(zod_1.z.string()).optional().describe('Tools expected to be called'),
    actualTool: zod_1.z.string().describe('The tool that was actually executed'),
    toolResult: zod_1.z.any().optional().describe('Result from the tool execution'),
    context: zod_1.z.string().optional().describe('Additional context about why this tool was chosen'),
});
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
        c.header('Cache-Control', 'no-cache, no-transform');
        c.header('Connection', 'keep-alive');
        c.header('X-Accel-Buffering', 'no');
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
// Quality check endpoint - validate AI tool execution quality
agent.post('/quality-check', async (c) => {
    try {
        const body = await c.req.json();
        const validation = qualityCheckSchema.safeParse(body);
        if (!validation.success) {
            return c.json({
                error: 'Invalid request',
                details: validation.error.issues
            }, 400);
        }
        const { operation, expectedTools, actualTool, toolResult, context } = validation.data;
        // Determine if the tool is correct for the operation
        const validTools = TOOL_CATEGORIES[operation] || [];
        const isToolValid = validTools.length === 0 || validTools.includes(actualTool);
        // Calculate quality score
        let qualityScore = 0;
        let feedback = '';
        if (isToolValid) {
            qualityScore = 100;
            feedback = `Correct tool "${actualTool}" was used for operation "${operation}"`;
        }
        else {
            // Partial credit if expected tools provided
            if (expectedTools && expectedTools.includes(actualTool)) {
                qualityScore = 80;
                feedback = `Tool "${actualTool}" was in expected list but not the primary recommendation`;
            }
            else {
                qualityScore = 0;
                feedback = `Incorrect tool "${actualTool}" for operation "${operation}". Expected one of: ${validTools.join(', ')}`;
            }
        }
        // Check tool result for additional quality signals
        let executionSuccess = false;
        if (toolResult) {
            executionSuccess = !toolResult.error && !toolResult.status?.includes('failed');
        }
        const result = {
            operation,
            actualTool,
            expectedTools: validTools,
            isValid: isToolValid,
            qualityScore,
            feedback,
            executionSuccess,
            context,
            timestamp: new Date().toISOString(),
        };
        // Log quality check for monitoring
        logger_1.logger.info({
            operation,
            tool: actualTool,
            score: qualityScore,
            success: executionSuccess
        }, '[QualityCheck] Tool execution validated');
        // Store in history
        agentHistory.push({ type: 'quality-check', ...result });
        if (agentHistory.length > 100)
            agentHistory.shift();
        return c.json(result);
    }
    catch (e) {
        logger_1.logger.error(e, '[QualityCheck] Error validating tool');
        return c.json({ error: e.message }, 500);
    }
});
// Batch quality check for multiple tool executions
agent.post('/quality-check/batch', async (c) => {
    try {
        const body = await c.req.json();
        const checks = body.checks;
        if (!Array.isArray(checks) || checks.length === 0) {
            return c.json({ error: 'Expected array of quality checks' }, 400);
        }
        const results = checks.map(check => {
            const validation = qualityCheckSchema.safeParse(check);
            if (!validation.success) {
                return { error: validation.error.issues, operation: check.operation };
            }
            const { operation, expectedTools, actualTool, toolResult } = validation.data;
            const validTools = TOOL_CATEGORIES[operation] || [];
            const isToolValid = validTools.length === 0 || validTools.includes(actualTool);
            let qualityScore = 0;
            if (isToolValid) {
                qualityScore = 100;
            }
            else if (expectedTools?.includes(actualTool)) {
                qualityScore = 80;
            }
            return {
                operation,
                actualTool,
                isValid: isToolValid,
                qualityScore,
                executionSuccess: !toolResult?.error && !toolResult?.status?.includes('failed'),
            };
        });
        const avgScore = results.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / results.length;
        return c.json({
            results,
            summary: {
                totalChecks: results.length,
                averageQualityScore: Math.round(avgScore),
                passed: results.filter(r => r.isValid).length,
                failed: results.filter(r => !r.isValid).length,
            }
        });
    }
    catch (e) {
        logger_1.logger.error(e, '[QualityCheck] Batch validation error');
        return c.json({ error: e.message }, 500);
    }
});
exports.default = agent;
