"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AutonomousLoop_1 = require("./AutonomousLoop");
async function main() {
    console.log('--- STARTING AI SDK AUTONOMOUS SMOKE TEST ---');
    try {
        const result = await (0, AutonomousLoop_1.runAutonomousCycle)();
        console.log('--- SMOKE TEST SUCCESSFUL ---');
        console.log('History detail:');
        const history = result.messages || [];
        history.forEach((msg, i) => {
            const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            console.log(`Message ${i + 1} [${msg.role}]:`, contentStr?.substring(0, 200) || '(No content)');
        });
        console.log('Final Summary:', result.text || '(Empty Response)');
        process.exit(0);
    }
    catch (e) {
        console.error('--- SMOKE TEST FAILED ---');
        console.error(e);
        process.exit(1);
    }
}
main();
