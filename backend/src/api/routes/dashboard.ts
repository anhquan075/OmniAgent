
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { agentEvents } from '../../agent/AutonomousLoop';

const dashboard = new Hono();

dashboard.get('/events', async (c) => {
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
      } catch (e) { console.error('SSE Write Error:', e); }
    };

    const onStepFinish = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'step:finish', ...data }),
          event: 'agent-event',
        });
      } catch (e) { console.error('SSE Write Error:', e); }
    };

    const onCycleEnd = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'cycle:end', ...data }),
          event: 'agent-event',
        });
      } catch (e) { console.error('SSE Write Error:', e); }
    };

    const onCycleError = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'cycle:error', ...data }),
          event: 'agent-event',
        });
      } catch (e) { console.error('SSE Write Error:', e); }
    };

    const onStatusSleeping = async (data: any) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'status:sleeping', ...data }),
          event: 'agent-event',
        });
      } catch (e) { console.error('SSE Write Error:', e); }
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
      console.log('Dashboard stream disconnected');
    });

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

export default dashboard;
