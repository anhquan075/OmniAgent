"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const streaming_1 = require("hono/streaming");
const RobotFleetService_1 = require("../../services/RobotFleetService");
const logger_1 = require("../../utils/logger");
const robotFleet = new hono_1.Hono();
const fleetEmitter = RobotFleetService_1.robotFleetService.getEmitter();
robotFleet.get('/events', async (c) => {
    logger_1.logger.info('[RobotFleet] Client connected to fleet SSE stream');
    return (0, streaming_1.streamSSE)(c, async (stream) => {
        logger_1.logger.debug('[RobotFleet] SSE stream established');
        logger_1.logger.info('[RobotFleetAPI] New SSE client connected');
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
        const status = RobotFleetService_1.robotFleetService.getFleetStatus();
        await stream.writeSSE({
            data: JSON.stringify({
                type: 'fleet:status',
                ...status
            }),
            event: 'fleet-event',
        });
        // Listen for new events from simulator
        const onFleetEvent = async (event) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({
                        type: 'fleet:task-completed',
                        event
                    }),
                    event: 'fleet-event',
                });
            }
            catch (e) {
                logger_1.logger.error(e, '[RobotFleetAPI] SSE Write Error');
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
            }
            catch (e) {
                logger_1.logger.error(e, '[RobotFleetAPI] Heartbeat failed');
                clearInterval(heartbeatInterval);
            }
        }, 30000);
        // Cleanup on disconnect
        stream.onAbort(() => {
            fleetEmitter.off('fleet:event', onFleetEvent);
            clearInterval(heartbeatInterval);
            logger_1.logger.info('[RobotFleetAPI] SSE client disconnected');
        });
        // Keep connection alive
        await new Promise(() => { });
    });
});
// Status endpoint (fallback for polling)
robotFleet.get('/status', async (c) => {
    try {
        logger_1.logger.debug('[RobotFleet] Fetching fleet status');
        const status = RobotFleetService_1.robotFleetService.getFleetStatus();
        logger_1.logger.info({ robotCount: status.robots.length, enabled: status.enabled }, '[RobotFleet] Status retrieved');
        return c.json(status);
    }
    catch (error) {
        logger_1.logger.error(error, '[RobotFleet] Status error');
        return c.json({
            error: 'Failed to get fleet status',
            message: error.message
        }, 500);
    }
});
exports.default = robotFleet;
