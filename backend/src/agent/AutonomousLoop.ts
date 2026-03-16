import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/config/env';
import { agentTools } from './tools';
import { EventEmitter } from 'events';
import { robotFleetService } from '@/services/RobotFleetService';

// Event Emitter for Dashboard Stream
export const agentEvents = new EventEmitter();

// Track fleet earnings across cycles
let lastFleetTotalEarned = "0.0";

const openai = createOpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
});

const SYSTEM_PROMPT = `You are the OmniWDK AFOS Strategist, an autonomous AI agent managing a DeFi vault.
Directive: Yield optimization for USD₮ and XAU₮ via Tether WDK & OmniWDK.
You are a Multi-VM Native Agent. You monitor and manage assets across EVM (BNB), Solana, and TON blockchains simultaneously.

WORKFLOW:
1. START by calling analyze_risk to get the latest proven risk metrics.
2. CHECK BALANCES by calling get_all_chain_balances to understand your multi-chain portfolio state.
3. EVALUATE the risk level based on the tool output.
   - If risk is HIGH: Call handle_emergency immediately.
   - If MEDIUM or LOW: Proceed to check_strategy or check_cross_chain_yields or hire_fleet_robot to find yield opportunities or gain insights.
4. OPTIMIZE: If opportunities exist, execute rebalances or bridging across supported chains.
5. SWEEP: Use yield_sweep if there's profit.
6. FINISH: Provide a technical summary of all findings and actions.

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
STANCE: Technical, analytical, security-first.`;

export interface AutonomousCycleResult {
  text: string;
  messages: any[];
  nextRunDelay?: number;
  schedulingConfidence?: number;
  schedulingReason?: string;
}

export async function runAutonomousCycle(): Promise<AutonomousCycleResult> {
  const modelId = env.OPENROUTER_MODEL_CRYPTO || 'deepseek/deepseek-chat';
  console.log(`[AutonomousLoop] Using crypto model: ${modelId} (Fortified Native maxSteps)`);
  console.log(`[AutonomousLoop] Starting cycle at ${new Date().toISOString()}...`);
  
  agentEvents.emit('cycle:start', { timestamp: new Date(), modelId });

  // Calculate fleet earnings since last cycle
  const fleetStatus = robotFleetService.getFleetStatus();
  const currentTotal = parseFloat(fleetStatus.fleetTotalEarned || "0");
  const lastTotal = parseFloat(lastFleetTotalEarned);
  const cycleEarnings = Math.max(0, currentTotal - lastTotal).toFixed(4);
  
  // Update last total for next cycle
  lastFleetTotalEarned = fleetStatus.fleetTotalEarned;

  let currentSystemPrompt = SYSTEM_PROMPT;
  let robotEarningsDetected = false;

  if (parseFloat(cycleEarnings) > 0) {
    console.log(`[AutonomousLoop] 💰 Fleet earnings since last cycle: ${cycleEarnings} ETH`);
    currentSystemPrompt += `\n\n[FLEET UPDATE]: Since your last cycle, the autonomous robot fleet has earned ${cycleEarnings} ETH. Consider this new capital in your strategy.`;
    robotEarningsDetected = true;
  }

  // Listen for robot fleet earnings (real-time during cycle)
  const fleetEmitter = robotFleetService.getEmitter();
  const onFleetEarning = (event: any) => {
    if (event.earnings && parseFloat(event.earnings) > 0) {
      console.log(`[AutonomousLoop] 🤖 Robot fleet earning detected: ${event.robotId} earned ${event.earnings} ETH`);
      robotEarningsDetected = true;
    }
  };
  fleetEmitter.on('fleet:event', onFleetEarning);

  try {
    const result = await generateText({
      model: openai.chat(modelId),
      tools: agentTools as any,
      maxSteps: 10,
      system: currentSystemPrompt,
      prompt: "Perform a full autonomous strategy cycle. Start with risk analysis and do not stop until you provide a final summary with NEXT_RUN_DECISION.",
      onStepFinish: (step: any) => {
        const callCount = step.toolCalls?.length || 0;
        console.log(`[AutonomousLoop] Step finished. Tool calls: ${callCount}`);
        agentEvents.emit('step:finish', { 
          stepType: callCount > 0 ? 'tool_execution' : 'reasoning',
          toolCalls: step.toolCalls,
          text: step.text 
        });
      }
    } as any);

    let finalResult = result;
    
    const messageHistory = result.response?.messages || [];
    const lastMessage = messageHistory.length > 0 ? messageHistory[messageHistory.length - 1] : null;
    const isToolExecutionLast = lastMessage?.role === 'tool';
    const isTextMissing = !result.text || result.text.trim().length === 0;

    if (isToolExecutionLast || isTextMissing) {
      console.log('[AutonomousLoop] Agent finished on tool execution or no text. Forcing synthesis...');
      
      const summaryResult = await generateText({
        model: openai.chat(modelId),
        system: currentSystemPrompt,
        messages: [
          { role: 'user', content: "Perform a full autonomous strategy cycle. Start with risk analysis and do not stop until you provide a final summary with NEXT_RUN_DECISION." },
          ...messageHistory,
          { role: 'user', content: 'Summarize the above tool results and provide a final technical summary of the autonomous cycle. MUST include NEXT_RUN_DECISION.' }
        ],
      });

      console.log(`[AutonomousLoop] Synthesis complete: ${summaryResult.text.slice(0, 50)}...`);
      
      finalResult = {
        ...result,
        text: summaryResult.text,
        response: {
          ...result.response,
          messages: [...messageHistory, ...summaryResult.response.messages]
        }
      } as any;
    }

    const summaryText = finalResult.text || "";
    console.log(`[AutonomousLoop] Summary: ${summaryText}`);

    const schedulingDecision = parseSchedulingDecision(summaryText);

    const cycleResult = { 
      text: summaryText,
      messages: finalResult.response?.messages || [],
      nextRunDelay: schedulingDecision.delay_ms,
      schedulingConfidence: schedulingDecision.confidence,
      schedulingReason: schedulingDecision.reason
    };

    agentEvents.emit('cycle:end', { 
      success: true, 
      summary: summaryText, 
      decision: schedulingDecision,
      robotEarningsDetected 
    });

    return cycleResult;
  } catch (error: any) {
    console.error(`[AutonomousLoop] Cycle failed:`, error);
    
    agentEvents.emit('cycle:error', { error: error.message });

    return {
      text: "",
      messages: [],
      nextRunDelay: 300000,
      schedulingConfidence: 0.5,
      schedulingReason: "Error occurred, using safe delay"
    };
  } finally {
    fleetEmitter.off('fleet:event', onFleetEarning);
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
function parseSchedulingDecision(text: string): {
  delay_ms: number;
  reason: string;
  confidence: number;
} {
  const defaultDecision = {
    delay_ms: 900000,
    reason: "Default moderate delay",
    confidence: 0.5
  };

  try {
    // Step 1: Find the NEXT_RUN_DECISION marker
    const decisionIndex = text.indexOf('NEXT_RUN_DECISION');
    if (decisionIndex === -1) {
      console.warn('[AutonomousLoop] No NEXT_RUN_DECISION found in summary');
      return defaultDecision;
    }

    // Step 2: Extract substring from marker onwards
    const afterMarker = text.substring(decisionIndex);

    // Step 3: Find the first '{' and last '}'
    const firstBrace = afterMarker.indexOf('{');
    if (firstBrace === -1) {
      console.warn('[AutonomousLoop] No opening brace found after NEXT_RUN_DECISION');
      return defaultDecision;
    }

    // Find the matching closing brace (simple approach: find last '}')
    const lastBrace = afterMarker.lastIndexOf('}');
    if (lastBrace === -1 || lastBrace <= firstBrace) {
      console.warn('[AutonomousLoop] No closing brace found after NEXT_RUN_DECISION');
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

    console.log(`[AutonomousLoop] Scheduling decision parsed: ${delay}ms (${reason})`);
    return { delay_ms: delay, reason, confidence };
  } catch (e) {
    console.warn('[AutonomousLoop] Failed to parse NEXT_RUN_DECISION:', e);
    return defaultDecision;
  }
}

let currentTimeout: NodeJS.Timeout | null = null;
let isRunning = false;

export async function startAutonomousLoop(initialDelayMs?: number): Promise<void> {
  if (isRunning) {
    console.warn('[AutonomousLoop] Loop already running');
    return;
  }
  
  isRunning = true;
  const INITIAL_DELAY = initialDelayMs || 5000; // Start almost immediately (5s) for first run
  console.log('--- OmniWDK Autonomous AI SDK Loop Started ---');

  const scheduleNext = (delay: number) => {
    if (!isRunning) return;
    
    console.log(`[AutonomousLoop] Sleeping for ${delay}ms...`);
    agentEvents.emit('status:sleeping', { duration: delay, wakeTime: new Date(Date.now() + delay) });
    
    currentTimeout = setTimeout(async () => {
      await run();
    }, delay);
  };

  const run = async () => {
    if (!isRunning) return;

    try {
      const result = await runAutonomousCycle();
      const nextDelay = result.nextRunDelay || 300000;
      scheduleNext(nextDelay);
    } catch (e) {
      console.error("Cycle error:", e);
      scheduleNext(300000); // Safe fallback
    }
  };

  // Initial run after short delay
  scheduleNext(INITIAL_DELAY);
}

export function stopAutonomousLoop(): void {
  isRunning = false;
  if (currentTimeout) {
    clearTimeout(currentTimeout);
    currentTimeout = null;
    console.log('[AutonomousLoop] Loop stopped');
    agentEvents.emit('status:stopped');
  }
}

const isMain = process.argv[1]?.endsWith('src/agent/AutonomousLoop.ts') || 
               process.argv[1]?.endsWith('src/agent/AutonomousLoop.js') ||
               process.argv[1]?.endsWith('dist/agent/AutonomousLoop.js');

if (isMain) {
  startAutonomousLoop();
}
