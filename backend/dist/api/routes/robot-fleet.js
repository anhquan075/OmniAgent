"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const streaming_1 = require("hono/streaming");
const RobotFleetService_1 = require("../../services/RobotFleetService");
const robotFleet = new hono_1.Hono();
const fleetEmitter = RobotFleetService_1.robotFleetService.getEmitter();
robotFleet.get('/events', async (c) => {
    return (0, streaming_1.streamSSE)(c, async (stream) => {
        console.log('[RobotFleetAPI] New SSE client connected');
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
                console.error('[RobotFleetAPI] SSE Write Error:', e);
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
                console.error('[RobotFleetAPI] Heartbeat failed:', e);
                clearInterval(heartbeatInterval);
            }
        }, 30000);
        // Cleanup on disconnect
        stream.onAbort(() => {
            fleetEmitter.off('fleet:event', onFleetEvent);
            clearInterval(heartbeatInterval);
            console.log('[RobotFleetAPI] SSE client disconnected');
        });
        // Keep connection alive
        await new Promise(() => { });
    });
});
// Status endpoint (fallback for polling)
robotFleet.get('/status', async (c) => {
    try {
        const status = RobotFleetService_1.robotFleetService.getFleetStatus();
        return c.json(status);
    }
    catch (error) {
        console.error('[RobotFleetAPI] Status error:', error);
        return c.json({
            error: 'Failed to get fleet status',
            message: error.message
        }, 500);
    }
});
exports.default = robotFleet;
