import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { agentEvents } from '../../agent/AutonomousLoop';
import { logger } from '@/utils/logger';

const dashboard = new Hono();

dashboard.get('/events', async (c) => {
  logger.info('[Dashboard] Client connected to SSE stream');
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ type: 'connected', message: 'Dashboard Stream Connected' }),
      event: 'message',
    });

    const onCycleStart = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'cycle:start', ...data }),
          event: 'agent-event',
        });
      } catch (e) { logger.error(e, '[Dashboard] SSE Write Error (cycle:start)'); }
    };

    const onStepFinish = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'step:finish', ...data }),
          event: 'agent-event',
        });
      } catch (e) { logger.error(e, '[Dashboard] SSE Write Error (step:finish)'); }
    };

    const onCycleEnd = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'cycle:end', ...data }),
          event: 'agent-event',
        });
      } catch (e) { logger.error(e, '[Dashboard] SSE Write Error (cycle:end)'); }
    };

    const onCycleError = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'cycle:error', ...data }),
          event: 'agent-event',
        });
      } catch (e) { logger.error(e, '[Dashboard] SSE Write Error (cycle:error)'); }
    };

    const onStatusSleeping = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'status:sleeping', ...data }),
          event: 'agent-event',
        });
      } catch (e) { logger.error(e, '[Dashboard] SSE Write Error (status:sleeping)'); }
    };

    agentEvents.on('cycle:start', onCycleStart);
    agentEvents.on('step:finish', onStepFinish);
    agentEvents.on('cycle:end', onCycleEnd);
    agentEvents.on('cycle:error', onCycleError);
    agentEvents.on('status:sleeping', onStatusSleeping);

    stream.onAbort(() => {
      agentEvents.off('cycle:start', onCycleStart);
      agentEvents.off('step:finish', onStepFinish);
      agentEvents.off('cycle:end', onCycleEnd);
      agentEvents.off('cycle:error', onCycleError);
      agentEvents.off('status:sleeping', onStatusSleeping);
      logger.info('[Dashboard] SSE client disconnected');
    });

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

export default dashboard;
