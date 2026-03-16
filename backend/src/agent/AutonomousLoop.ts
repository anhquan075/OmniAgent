import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/config/env';
import { agentTools } from './tools';

const openai = createOpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
});

const SYSTEM_PROMPT = `You are the OmniWDK AFOS Strategist, an autonomous AI agent managing a DeFi vault.
Directive: Yield optimization for USD₮ and XAU₮ via Tether WDK & ProofVault.

WORKFLOW:
1. START by calling analyze_risk to get the latest proven risk metrics.
2. EVALUATE the risk level based on the tool output.
   - If risk is HIGH: Call handle_emergency immediately.
   - If MEDIUM or LOW: Proceed to check_strategy or check_cross_chain_yields to find yield opportunities.
3. OPTIMIZE: If opportunities exist, execute rebalances or bridging.
4. SWEEP: Use yield_sweep if there's profit.
5. FINISH: Provide a technical summary of all findings and actions.

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
  
  try {
    const result = await generateText({
      model: openai.chat(modelId),
      tools: agentTools as any,
      maxSteps: 10,
      system: SYSTEM_PROMPT,
      prompt: "Perform a full autonomous strategy cycle. Start with risk analysis and do not stop until you provide a final summary with NEXT_RUN_DECISION.",
      onStepFinish: (step: any) => {
        const callCount = step.toolCalls?.length || 0;
        console.log(`[AutonomousLoop] Step finished. Tool calls: ${callCount}`);
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
        system: SYSTEM_PROMPT,
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

    return { 
      text: summaryText,
      messages: finalResult.response?.messages || [],
      nextRunDelay: schedulingDecision.delay_ms,
      schedulingConfidence: schedulingDecision.confidence,
      schedulingReason: schedulingDecision.reason
    };
  } catch (error: any) {
    console.error(`[AutonomousLoop] Cycle failed:`, error);
    return {
      text: "",
      messages: [],
      nextRunDelay: 300000,
      schedulingConfidence: 0.5,
      schedulingReason: "Error occurred, using safe delay"
    };
  }
}

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
    const match = text.match(/NEXT_RUN_DECISION:\s*\{([^}]+)\}/s);
    if (!match) {
      console.warn('[AutonomousLoop] No NEXT_RUN_DECISION found in summary');
      return defaultDecision;
    }

    const jsonStr = `{${match[1]}}`;
    const parsed = JSON.parse(jsonStr);

    const delay = Math.max(300000, Math.min(3600000, parsed.delay_ms || 900000));
    const reason = parsed.reason || "No reason provided";
    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

    console.log(`[AutonomousLoop] Scheduling decision parsed: ${delay}ms (${reason})`);
    return { delay_ms: delay, reason, confidence };
  } catch (e) {
    console.warn('[AutonomousLoop] Failed to parse NEXT_RUN_DECISION:', e);
    return defaultDecision;
  }
}

let currentInterval: NodeJS.Timeout | null = null;

export async function startAutonomousLoop(initialDelayMs?: number): Promise<void> {
  const INITIAL_DELAY = initialDelayMs || 5 * 60 * 1000;
  console.log('--- OmniWDK Autonomous AI SDK Loop Started ---');

  let nextRunDelay = INITIAL_DELAY;

  const run = async () => {
    try {
      const result = await runAutonomousCycle();
      
      if (result.nextRunDelay) {
        nextRunDelay = result.nextRunDelay;
        console.log(`[AutonomousLoop] Next run scheduled in ${nextRunDelay}ms`);
      }
    } catch (e) {
      console.error("Cycle error:", e);
      nextRunDelay = 300000;
    }

    if (currentInterval) clearInterval(currentInterval);
    currentInterval = setInterval(run, nextRunDelay);
  };

  await run();
}

export function stopAutonomousLoop(): void {
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
    console.log('[AutonomousLoop] Loop stopped');
  }
}

const isMain = process.argv[1]?.endsWith('src/agent/AutonomousLoop.ts') || 
               process.argv[1]?.endsWith('src/agent/AutonomousLoop.js') ||
               process.argv[1]?.endsWith('dist/agent/AutonomousLoop.js');

if (isMain) {
  startAutonomousLoop();
}
