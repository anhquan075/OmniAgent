import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { robotFleetService, FleetEvent, Robot } from '../../services/RobotFleetService';
import { logger } from '@/utils/logger';

const robotFleet = new Hono();

const fleetEmitter = robotFleetService.getEmitter();

robotFleet.get('/events', async (c) => {
  logger.info('[RobotFleet] Client connected to fleet SSE stream');
  return streamSSE(c, async (stream) => {
    logger.debug('[RobotFleet] SSE stream established');
    logger.info('[RobotFleetAPI] New SSE client connected');
    
    // Send initial connection message
    await stream.writeSSE({
      data: JSON.stringify({ 
        type: 'connected', 
        message: 'Robot Fleet Stream Connected',
        timestamp: new Date().toISOString()
      }),
      event: 'message',
    });

    // Send current status
    const status = robotFleetService.getFleetStatus();
    await stream.writeSSE({
      data: JSON.stringify({ 
        type: 'fleet:status', 
        ...status 
      }),
      event: 'fleet-event',
    });

    // Listen for new events from simulator
    const onFleetEvent = async (event: FleetEvent) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ 
            type: 'fleet:task-completed', 
            event 
          }),
          event: 'fleet-event',
        });
      } catch (e) {
        logger.error(e, '[RobotFleetAPI] SSE Write Error');
      }
    };

    fleetEmitter.on('fleet:event', onFleetEvent);

    // Heartbeat every 30 seconds
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          data: JSON.stringify({ 
            type: 'heartbeat', 
            timestamp: new Date().toISOString() 
          }),
          event: 'heartbeat',
        });
      } catch (e) {
        logger.error(e, '[RobotFleetAPI] Heartbeat failed');
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Cleanup on disconnect
    stream.onAbort(() => {
      fleetEmitter.off('fleet:event', onFleetEvent);
      clearInterval(heartbeatInterval);
      logger.info('[RobotFleetAPI] SSE client disconnected');
    });

    // Keep connection alive
    await new Promise(() => {});
  });
});

// Status endpoint (fallback for polling)
robotFleet.get('/status', async (c) => {
  try {
    logger.debug('[RobotFleet] Fetching fleet status');
    const status = robotFleetService.getFleetStatus();
    logger.info({ robotCount: status.robots.length, enabled: status.enabled }, '[RobotFleet] Status retrieved');
    return c.json(status);
  } catch (error: any) {
    logger.error(error, '[RobotFleet] Status error');
    return c.json({ 
      error: 'Failed to get fleet status', 
      message: error.message 
    }, 500);
  }
});

export default robotFleet;
