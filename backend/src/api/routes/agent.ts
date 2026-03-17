import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { env } from '@/config/env';
import { AgentService } from '@/agent/services/AgentService';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { runAutonomousCycle } from '@/agent/AutonomousLoop';
import { logger } from '@/utils/logger';

const agent = new Hono();
const agentEvents = new EventEmitter();
let agentHistory: any[] = [];

// Webhook signature verification helper
const verifySignature = (payload: string, signature: string | undefined) => {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // Dev fallback
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (e) {
    return false;
  }
};

// SSE Stream for Agent Brain
agent.get('/stream', (c) => {
  logger.info('[Agent] Client connected to agent stream');
  return stream(c, async (stream) => {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    // Send history immediately
    await stream.write(`data: ${JSON.stringify({ type: 'history', data: agentHistory })}\n\n`);

    const listener = (event: any) => {
      stream.write(`data: ${JSON.stringify({ type: 'event', data: event })}\n\n`);
    };

    agentEvents.on('agent-update', listener);

    // Keep-alive heartbeat
    const interval = setInterval(() => {
      stream.write(': heartbeat\n\n');
    }, 15000);

    // Clean up on disconnect
    c.req.raw.signal.addEventListener('abort', () => {
      logger.info('[Agent] Client disconnected from stream');
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
  logger.debug({ node: body.node, action: body.action }, '[Agent] Received report');
  
  const event = {
    ...body,
    timestamp: new Date().toISOString(),
    id: Date.now()
  };
  
  agentHistory.push(event);
  if (agentHistory.length > 100) agentHistory.shift();
  
  agentEvents.emit('agent-update', event);
  logger.debug('[Agent] Report emitted to listeners');
  return c.text('OK');
});

// Webhook receiver
agent.post('/webhook', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const eventName = c.req.header('x-github-event');
  const rawBody = await c.req.text();

  logger.info({ event: eventName }, '[Webhook] Received event');

  if (!verifySignature(rawBody, signature)) {
    logger.warn('[Webhook] Invalid signature');
    return c.text('Invalid signature', 401);
  }

  const payload = JSON.parse(rawBody);
  logger.info({ event: eventName, action: payload.action }, '[Webhook] Processing event');

  // Trigger rebalance on specific events
  let shouldTrigger = false;
  if (eventName === 'pull_request' && payload.pull_request?.merged) shouldTrigger = true;
  if (eventName === 'issues' && payload.issue?.state === 'closed') shouldTrigger = true;
  if (eventName === 'push') shouldTrigger = true;

  if (shouldTrigger) {
    AgentService.runCycle().catch(e => logger.error(e, '[Webhook] Rebalance trigger failed'));
    return c.json({ success: true, message: 'Autonomous cycle triggered' });
  }

  return c.json({ success: true, message: 'Event logged' });
});

let cronExecutionCount = 0;
let lastCronTime: string | null = null;

agent.post('/run-cycle', async (c) => {
  const secret = env.AGENT_CRON_SECRET;
  if (secret && c.req.header('x-cron-secret') !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    cronExecutionCount++;
    lastCronTime = new Date().toISOString();
    const result = await runAutonomousCycle();
    return c.json({
      success: true,
      summary: result.text?.slice(0, 500),
      nextRunDelay: result.nextRunDelay,
      schedulingReason: result.schedulingReason,
    });
  } catch (e: any) {
    logger.error(e, '[RunCycle] Cron-triggered cycle failed');
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

export default agent;
