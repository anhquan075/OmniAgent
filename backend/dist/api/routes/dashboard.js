"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const streaming_1 = require("hono/streaming");
const AutonomousLoop_1 = require("../../agent/AutonomousLoop");
const dashboard = new hono_1.Hono();
dashboard.get('/events', async (c) => {
    return (0, streaming_1.streamSSE)(c, async (stream) => {
        await stream.writeSSE({
            data: JSON.stringify({ type: 'connected', message: 'Dashboard Stream Connected' }),
            event: 'message',
        });
        const onCycleStart = async (data) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({ type: 'cycle:start', ...data }),
                    event: 'agent-event',
                });
            }
            catch (e) {
                console.error('SSE Write Error:', e);
            }
        };
        const onStepFinish = async (data) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({ type: 'step:finish', ...data }),
                    event: 'agent-event',
                });
            }
            catch (e) {
                console.error('SSE Write Error:', e);
            }
        };
        const onCycleEnd = async (data) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({ type: 'cycle:end', ...data }),
                    event: 'agent-event',
                });
            }
            catch (e) {
                console.error('SSE Write Error:', e);
            }
        };
        const onCycleError = async (data) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({ type: 'cycle:error', ...data }),
                    event: 'agent-event',
                });
            }
            catch (e) {
                console.error('SSE Write Error:', e);
            }
        };
        const onStatusSleeping = async (data) => {
            try {
                await stream.writeSSE({
                    data: JSON.stringify({ type: 'status:sleeping', ...data }),
                    event: 'agent-event',
                });
            }
            catch (e) {
                console.error('SSE Write Error:', e);
            }
        };
        AutonomousLoop_1.agentEvents.on('cycle:start', onCycleStart);
        AutonomousLoop_1.agentEvents.on('step:finish', onStepFinish);
        AutonomousLoop_1.agentEvents.on('cycle:end', onCycleEnd);
        AutonomousLoop_1.agentEvents.on('cycle:error', onCycleError);
        AutonomousLoop_1.agentEvents.on('status:sleeping', onStatusSleeping);
        stream.onAbort(() => {
            AutonomousLoop_1.agentEvents.off('cycle:start', onCycleStart);
            AutonomousLoop_1.agentEvents.off('step:finish', onStepFinish);
            AutonomousLoop_1.agentEvents.off('cycle:end', onCycleEnd);
            AutonomousLoop_1.agentEvents.off('cycle:error', onCycleError);
            AutonomousLoop_1.agentEvents.off('status:sleeping', onStatusSleeping);
            console.log('Dashboard stream disconnected');
        });
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    });
});
exports.default = dashboard;
