"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentEvents = void 0;
exports.runAutonomousCycle = runAutonomousCycle;
exports.updateDashboardState = updateDashboardState;
exports.getDashboardState = getDashboardState;
exports.startAutonomousLoop = startAutonomousLoop;
exports.stopAutonomousLoop = stopAutonomousLoop;
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const openai_1 = require("@ai-sdk/openai");
const ai_1 = require("ai");
const events_1 = require("events");
const HealthMonitor_1 = require("./services/HealthMonitor");
const tools_1 = require("./tools");
const council_1 = require("./council/council");
const AaveAnalyst_1 = require("./council/members/AaveAnalyst");
const MarketVolatilityAnalyst_1 = require("./council/members/MarketVolatilityAnalyst");
const ZKRiskAnalyst_1 = require("./council/members/ZKRiskAnalyst");
// Event Emitter for Dashboard Stream
exports.agentEvents = new events_1.EventEmitter();
const openai = (0, openai_1.createOpenAI)({
    apiKey: env_1.env.OPENROUTER_API_KEY,
    baseURL: env_1.env.OPENROUTER_BASE_URL,
});
// Initialize Council of Experts
const council = (0, council_1.getCouncil)();
council.addMember(new AaveAnalyst_1.AaveAnalyst());
council.addMember(new MarketVolatilityAnalyst_1.MarketVolatilityAnalyst());
council.addMember(new ZKRiskAnalyst_1.ZKRiskAnalyst());
const SYSTEM_PROMPT = `You are the OmniAgent AFOS Strategist, an autonomous AI agent managing a DeFi vault.
Directive: Yield optimization for USDT and XAUT via Tether WDK & OmniAgent.
You are a Multi-VM Native Agent. You monitor and manage assets across EVM (Ethereum/Sepolia), Solana, and TON blockchains simultaneously.

WORKFLOW (Council of Experts Pattern):
1. COUNCIL CONSENSUS: The Council of Experts (3 sub-agents) has already analyzed the market and reached consensus.
   - AaveAnalyst: Analyzed lending APY and health factor
   - MarketVolatilityAnalyst: Analyzed price volatility and regime state  
   - ZKRiskAnalyst: Analyzed ZKRiskOracle metrics and drawdown probability
   Their consensus decision and confidence score are provided in your context.

2. START by calling analyze_risk to validate council metrics with on-chain data.
3. CHECK BALANCES by calling get_all_chain_balances to understand your multi-chain portfolio state.
4. EXECUTE based on council consensus + your analysis:
   - If council recommends 'risk-off' AND confidence > 0.7: Execute XAUt swap for safety
   - If council recommends 'yield-chase' AND confidence > 0.7: Execute Aave supply
   - If council recommends 'rebalance' AND confidence > 0.7: Execute rebalance
   - If confidence 0.4-0.7: Log warning, proceed cautiously
   - If confidence < 0.4: Skip cycle, sleep longer

5. SWEEP: Use yield_sweep if there's profit.
6. FINISH: Provide a technical summary with NEXT_RUN_DECISION.

SCHEDULING DECISIONS:
At the end of your summary, MUST include a scheduling decision in this format:
  NEXT_RUN_DECISION: {
    "delay_ms": <milliseconds>,
    "reason": "<brief reason>",
    "confidence": <0.0-1.0>
  }

Guidelines for scheduling:
- If HIGH risk detected: delay_ms = 5 minutes (300000ms) - need caution
- If MEDIUM risk & yield opportunities: delay_ms = 15 minutes (900000ms) - monitor frequently
- If LOW risk & no opportunities: delay_ms = 60 minutes (3600000ms) - things stable
- If HIGH profit potential detected: delay_ms = 5 minutes (300000ms) - move fast
- If emergency handled: delay_ms = 30 minutes (1800000ms) - recovery period
- Minimum delay: 300000ms (5 minutes)
- Maximum delay: 3600000ms (1 hour)

IMPORTANT: You MUST continue the conversation until you provide a final technical summary with NEXT_RUN_DECISION. Do not stop after a tool call. Use tool results to decide your next move.
STANCE: Technical, analytical, security-first.

ABSOLUTE RULES (NEVER violate):
1. ALWAYS use the exact data returned in tool results — do not make up or hallucinate answers
2. If a tool returns {success:true, nativeBalance:"0.35 ETH"}, you MUST say "Balance is 0.35 ETH" — NOT explain what Sepolia is
3. NEVER ignore tool result data — it IS the answer
4. NEVER say you "cannot" or "don't have access to" when a tool just returned the data
5. Tool result data is the ground truth — use it verbatim in your summary
6. When a tool has an optional address parameter, OMIT it to check YOUR wallet
7. After ANY tool call, read the FULL result object before responding`;
async function runAutonomousCycle() {
    const modelId = env_1.env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast';
    logger_1.logger.info({ modelId }, '[AutonomousLoop] Starting cycle');
    exports.agentEvents.emit('cycle:start', { timestamp: new Date(), modelId });
    updateDashboardState({ type: 'cycle:start', data: { timestamp: new Date(), modelId } });
    const wdkAddress = env_1.env.WDK_VAULT_ADDRESS;
    if (wdkAddress) {
        const healthAlert = await HealthMonitor_1.healthMonitor.monitorPosition(wdkAddress);
        if (healthAlert) {
            logger_1.logger.warn({ alert: healthAlert }, '[AutonomousLoop] Health factor alert detected');
            exports.agentEvents.emit('health:alert', healthAlert);
            if (healthAlert.type === 'emergency') {
                logger_1.logger.error('[AutonomousLoop] EMERGENCY: Health factor critical - prioritizing deleveraging');
            }
        }
    }
    // Council of Experts deliberation
    const marketContext = {
        vaultBalance: '0',
        aaveApy: 5.0,
        volatility: 15.0,
        riskScore: 30,
        drawdownProbabilityBps: 500,
    };
    let councilConsensus = null;
    try {
        councilConsensus = await council.deliberate(marketContext);
        logger_1.logger.info({
            decision: councilConsensus.decision,
            confidence: councilConsensus.confidence,
        }, '[AutonomousLoop] Council consensus reached');
        exports.agentEvents.emit('council:consensus', councilConsensus);
        // Skip cycle if council confidence too low
        if (councilConsensus.confidence < 0.4) {
            logger_1.logger.warn({ confidence: councilConsensus.confidence }, '[AutonomousLoop] Council confidence too low, skipping cycle');
            return {
                text: `Council confidence ${councilConsensus.confidence.toFixed(2)} below threshold. Skipping cycle.`,
                messages: [],
                nextRunDelay: 3600000,
                schedulingConfidence: 0.3,
                schedulingReason: 'Low council confidence, sleeping longer',
            };
        }
    }
    catch (error) {
        logger_1.logger.warn({ error }, '[AutonomousLoop] Council deliberation failed, proceeding without consensus');
    }
    try {
        const councilContext = councilConsensus
            ? `\n\n[COUNCIL CONSENSUS]: Decision=${councilConsensus.decision}, Confidence=${councilConsensus.confidence.toFixed(2)}. Reasoning: ${councilConsensus.reasoning}`
            : '\n\n[COUNCIL CONSENSUS]: Unavailable, proceed with caution.';
        const result = await (0, ai_1.generateText)({
            model: openai.chat(modelId),
            tools: tools_1.agentTools,
            maxSteps: 10,
            system: SYSTEM_PROMPT + councilContext,
            temperature: 0,
            prompt: "Perform a full autonomous strategy cycle. Start with risk analysis and do not stop until you provide a final summary with NEXT_RUN_DECISION.",
            onStepFinish: (step) => {
                const callCount = step.toolCalls?.length || 0;
                logger_1.logger.debug({ callCount }, '[AutonomousLoop] Step finished');
                exports.agentEvents.emit('step:finish', {
                    stepType: callCount > 0 ? 'tool_execution' : 'reasoning',
                    toolCalls: step.toolCalls,
                    text: step.text
                });
            }
        });
        let finalResult = result;
        const messageHistory = result.response?.messages || [];
        const lastMessage = messageHistory.length > 0 ? messageHistory[messageHistory.length - 1] : null;
        const isToolExecutionLast = lastMessage?.role === 'tool';
        const isTextMissing = !result.text || result.text.trim().length === 0;
        if (isToolExecutionLast || isTextMissing) {
            logger_1.logger.info('[AutonomousLoop] Agent finished on tool execution or no text. Forcing synthesis...');
            const summaryResult = await (0, ai_1.generateText)({
                model: openai.chat(modelId),
                system: SYSTEM_PROMPT + councilContext,
                temperature: 0,
                messages: [
                    { role: 'user', content: "Perform a full autonomous strategy cycle. Start with risk analysis and do not stop until you provide a final summary with NEXT_RUN_DECISION." },
                    ...messageHistory,
                    { role: 'user', content: 'Summarize the above tool results and provide a final technical summary of the autonomous cycle. MUST include NEXT_RUN_DECISION.' }
                ],
            });
            logger_1.logger.info('[AutonomousLoop] Synthesis complete');
            finalResult = {
                ...result,
                text: summaryResult.text,
                response: {
                    ...result.response,
                    messages: [...messageHistory, ...summaryResult.response.messages]
                }
            };
        }
        const summaryText = finalResult.text || "";
        logger_1.logger.debug({ summaryText }, '[AutonomousLoop] Cycle Summary');
        const schedulingDecision = parseSchedulingDecision(summaryText);
        const cycleResult = {
            text: summaryText,
            messages: finalResult.response?.messages || [],
            nextRunDelay: schedulingDecision.delay_ms,
            schedulingConfidence: schedulingDecision.confidence,
            schedulingReason: schedulingDecision.reason
        };
        exports.agentEvents.emit('cycle:end', {
            success: true,
            summary: summaryText,
            decision: schedulingDecision,
            councilConsensus: councilConsensus ? {
                decision: councilConsensus.decision,
                confidence: councilConsensus.confidence,
            } : null,
        });
        updateDashboardState({ type: 'cycle:end', data: { success: true, summary: summaryText, decision: schedulingDecision, councilConsensus } });
        return cycleResult;
    }
    catch (error) {
        logger_1.logger.error(error, '[AutonomousLoop] Cycle failed');
        exports.agentEvents.emit('cycle:error', { error: error.message });
        updateDashboardState({ type: 'cycle:error', data: { error: error.message } });
        return {
            text: "",
            messages: [],
            nextRunDelay: 300000,
            schedulingConfidence: 0.5,
            schedulingReason: "Error occurred, using safe delay"
        };
    }
}
/**
 * Robustly parses a scheduling decision from agent output.
 *
 * Expected format (must appear in agent response):
 *   NEXT_RUN_DECISION: {
 *     "delay_ms": <number>,
 *     "reason": "<string>",
 *     "confidence": <number between 0 and 1>
 *   }
 *
 * This function handles common LLM output quirks:
 * - Markdown code blocks (```json ... ```)
 * - Nested braces in comments or strings
 * - Trailing commas
 * - Extra whitespace and newlines
 * - Single quotes vs double quotes (relaxed parsing)
 *
 * Returns safe defaults if parsing fails:
 * - delay_ms: 900000 (15 minutes)
 * - reason: "Default moderate delay"
 * - confidence: 0.5
 *
 * @param text - The full agent output text
 * @returns Object with delay_ms (clamped 300000-3600000), reason, and confidence (0-1)
 */
function parseSchedulingDecision(text) {
    const defaultDecision = {
        delay_ms: 900000,
        reason: "Default moderate delay",
        confidence: 0.5
    };
    try {
        // Step 1: Find the NEXT_RUN_DECISION marker
        const decisionIndex = text.indexOf('NEXT_RUN_DECISION');
        if (decisionIndex === -1) {
            logger_1.logger.warn('[AutonomousLoop] No NEXT_RUN_DECISION found in summary');
            return defaultDecision;
        }
        // Step 2: Extract substring from marker onwards
        const afterMarker = text.substring(decisionIndex);
        // Step 3: Find the first '{' and last '}'
        const firstBrace = afterMarker.indexOf('{');
        if (firstBrace === -1) {
            logger_1.logger.warn('[AutonomousLoop] No opening brace found after NEXT_RUN_DECISION');
            return defaultDecision;
        }
        // Find the matching closing brace (simple approach: find last '}')
        const lastBrace = afterMarker.lastIndexOf('}');
        if (lastBrace === -1 || lastBrace <= firstBrace) {
            logger_1.logger.warn('[AutonomousLoop] No closing brace found after NEXT_RUN_DECISION');
            return defaultDecision;
        }
        // Step 4: Extract the JSON substring
        let jsonStr = afterMarker.substring(firstBrace, lastBrace + 1);
        // Step 5: Strip Markdown code block markers if present
        jsonStr = jsonStr
            .replace(/^```(?:json)?\s*/i, '') // Remove opening ```json or ```
            .replace(/\s*```$/, ''); // Remove closing ```
        // Step 6: Sanitize common LLM JSON quirks
        // Remove trailing commas before } and ]
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        // Replace single quotes with double quotes (relaxed parsing)
        jsonStr = jsonStr.replace(/'([^']*)'/g, '"$1"');
        // Remove comments (// and /* */ style)
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        // Step 7: Parse JSON
        const parsed = JSON.parse(jsonStr);
        // Step 8: Validate and clamp values
        const delay = Math.max(300000, Math.min(3600000, parsed.delay_ms || 900000));
        const reason = String(parsed.reason || "No reason provided");
        const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
        logger_1.logger.info({ delay, reason }, '[AutonomousLoop] Scheduling decision parsed');
        return { delay_ms: delay, reason, confidence };
    }
    catch (e) {
        logger_1.logger.warn(e, '[AutonomousLoop] Failed to parse NEXT_RUN_DECISION');
        return defaultDecision;
    }
}
let currentTimeout = null;
let isRunning = false;
let dashboardState = {
    status: 'idle',
    recentEvents: [],
};
function updateDashboardState(event) {
    const entry = {
        type: event.type,
        data: event.data,
        timestamp: new Date().toISOString(),
    };
    dashboardState.recentEvents.unshift(entry);
    if (dashboardState.recentEvents.length > 20)
        dashboardState.recentEvents.pop();
    if (event.type === 'cycle:start') {
        dashboardState.status = 'running';
        dashboardState.lastCycleSummary = undefined;
    }
    else if (event.type === 'cycle:end') {
        dashboardState.status = 'sleeping';
        dashboardState.lastCycleEnd = new Date().toISOString();
        dashboardState.lastCycleSummary = event.data?.summary?.slice(0, 500);
        dashboardState.nextWakeTime = event.data?.decision?.nextRunDelay
            ? new Date(Date.now() + event.data.decision.nextRunDelay).toISOString()
            : undefined;
    }
    else if (event.type === 'cycle:error') {
        dashboardState.status = 'error';
        dashboardState.lastCycleEnd = new Date().toISOString();
    }
    else if (event.type === 'status:sleeping') {
        dashboardState.status = 'sleeping';
        dashboardState.nextWakeTime = event.data?.wakeTime;
    }
}
function getDashboardState() {
    return { ...dashboardState };
}
async function startAutonomousLoop(initialDelayMs) {
    if (isRunning) {
        logger_1.logger.warn('[AutonomousLoop] Loop already running');
        return;
    }
    isRunning = true;
    const INITIAL_DELAY = initialDelayMs || 5000; // Start almost immediately (5s) for first run
    logger_1.logger.info('--- OmniAgent Autonomous AI SDK Loop Started ---');
    const scheduleNext = (delay) => {
        if (!isRunning)
            return;
        logger_1.logger.info({ delay, wakeTime: new Date(Date.now() + delay).toISOString() }, '[AutonomousLoop] Sleeping');
        exports.agentEvents.emit('status:sleeping', { duration: delay, wakeTime: new Date(Date.now() + delay) });
        updateDashboardState({ type: 'status:sleeping', data: { duration: delay, wakeTime: new Date(Date.now() + delay) } });
        currentTimeout = setTimeout(async () => {
            await run();
        }, delay);
    };
    const run = async () => {
        if (!isRunning)
            return;
        try {
            const result = await runAutonomousCycle();
            const nextDelay = result.nextRunDelay || 300000;
            scheduleNext(nextDelay);
        }
        catch (e) {
            logger_1.logger.error(e, '[AutonomousLoop] Cycle error');
            scheduleNext(300000); // Safe fallback
        }
    };
    // Initial run after short delay
    scheduleNext(INITIAL_DELAY);
}
function stopAutonomousLoop() {
    isRunning = false;
    if (currentTimeout) {
        clearTimeout(currentTimeout);
        currentTimeout = null;
        logger_1.logger.info('[AutonomousLoop] Loop stopped');
        exports.agentEvents.emit('status:stopped');
    }
}
const isMain = process.argv[1]?.endsWith('src/agent/AutonomousLoop.ts') ||
    process.argv[1]?.endsWith('src/agent/AutonomousLoop.js') ||
    process.argv[1]?.endsWith('dist/agent/AutonomousLoop.js');
if (isMain) {
    startAutonomousLoop();
}
