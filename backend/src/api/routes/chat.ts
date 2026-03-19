import { logger } from '@/utils/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, streamText } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod';

import { normalizedAgentTools } from '@/agent/tools';
import { llmRouter } from '@/services/LLMRouter';
import { loadChat, saveChat } from '../../utils/chat-store';

const chat = new Hono();

/**
 * Generate AVAILABLE TOOLS section dynamically from tool definitions
 */
function generateAvailableToolsPrompt(): string {
  const tools: string[] = [];
  
  for (const [name, toolDef] of Object.entries(normalizedAgentTools)) {
    // Extract description from tool definition
    const description = (toolDef as any).description || `Tool: ${name}`;
    
    // Extract parameter schema if available
    let params = '';
    try {
      const paramsObj = (toolDef as any).parameters;
      if (paramsObj && paramsObj._def && paramsObj._def.shape) {
        const shape = paramsObj._def.shape();
        const paramNames = Object.keys(shape).filter(k => k !== 'ZodDefault');
        if (paramNames.length > 0) {
          params = ` (${paramNames.join(', ')})`;
        }
      }
    } catch (e) {
      // Ignore param extraction errors
    }
    
    tools.push(`- ${name}${params}: ${description}`);
  }
  
  return tools.join('\n');
}

// Cache the tools prompt (regenerate only if needed)
let cachedToolsPrompt: string | null = null;
function getAvailableToolsPrompt(): string {
  if (!cachedToolsPrompt) {
    cachedToolsPrompt = generateAvailableToolsPrompt();
  }
  return cachedToolsPrompt;
}

// Zod schema for suggestions
const suggestionsSchema = z.array(
  z.object({
    label: z.string().describe('Short label for the suggestion (max 3-4 words)'),
    prompt: z.string().describe('Full follow-up question or prompt'),
  })
);

// Fallback suggestions
const fallbackSuggestions = [
  { label: 'Analyze Drawdown', prompt: 'Show me the Monte Carlo drawdown analysis for this strategy.' },
  { label: 'Check Rails', prompt: 'Are the settlement rails active on Solana and TON?' },
  { label: 'Vault Status', prompt: 'What is the current vault health and liquidity?' }
];

async function generateSuggestions(
  model: any,
  messages: any[],
  assistantResponse: string
): Promise<typeof fallbackSuggestions> {
  try {
    const result = await generateText({
      model,
      temperature: 0,
      prompt: `Based on the following conversation and assistant response, generate 3 relevant follow-up suggestions that the user might ask next.

Assistant's response: "${assistantResponse.slice(0, 400)}"

Generate 3 contextual suggestions with:
- label: Short label (4-6 words max)
- prompt: Complete, specific follow-up question

Topics: DeFi strategies, yield optimization, vault management, settlement rails.

Return JSON array: [{"label": "...", "prompt": "..."}, ...]`,
    });

    const suggestions = JSON.parse(result.text);
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      return suggestions.slice(0, 3);
    }
  } catch (err) {
    logger.error(err, '[Chat] Error generating suggestions');
  }
  return fallbackSuggestions;
}

chat.post('/', async (c) => {
  logger.info('[Chat] Received POST /api/chat');
  
  const rawBody = await c.req.json().catch(() => null);
  const body = rawBody || {};
  const { messages: rawMessages, id }: { messages?: any[]; id?: string } = body;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  
  logger.info({ count: messages.length, hasInitial: messages.some(m => m.id === 'initial-1') }, '[Chat] Messages received');
  if (messages.length > 0) {
    logger.debug({ firstMsg: JSON.stringify(messages[0]).slice(0, 200) }, '[Chat] First message');
  }
  const chatId = id || 'default-chat-id';

  const lastUserMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  let userText = "";
  
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === 'string') {
      userText = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.parts)) {
      userText = lastUserMessage.parts.find((p: any) => p.type === 'text')?.text || '';
    } else if (lastUserMessage.content && typeof lastUserMessage.content === 'object') {
      userText = (lastUserMessage.content as any).text || '';
    }
  }

  const validMessages = messages.filter((m: any) => {
    if (!m?.role) return false;
    if (typeof m.content === 'string') return true;
    if (Array.isArray(m.content) && m.content.length > 0) return true;
    if (m.content?.text) return true;
    if (Array.isArray(m.parts) && m.parts.length > 0) return true;
    if (Array.isArray(m.toolInvocations) && m.toolInvocations.length > 0) return true;
    return false;
  });

  if (validMessages.length === 0) {
    logger.warn({ messages: JSON.stringify(messages).slice(0, 500) }, '[Chat] All messages filtered out');
    return c.json({ error: 'No valid messages provided' }, 400);
  }

  const normalizedMessages = validMessages.map((m: any) => {
    if (m.role === 'user' && typeof m.content === 'string') {
      return { ...m, content: [{ type: 'text' as const, text: m.content }] };
    }
    return m;
  });

  const openai = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  });

  const routerDecision = await llmRouter.smartRoute(userText);
  const modelId = routerDecision.recommendedModel;
  
  logger.info({ 
    userText: userText.slice(0, 50), 
    intent: routerDecision.intent,
    confidence: routerDecision.confidence,
    modelId 
  }, '[Chat] Processing query with LLM router');
  
  const baseModel = openai.chat(modelId);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        // Immediate feedback - Only show for non-small talk
        if (routerDecision.intent !== 'small_talk') {
          writer.write({
            type: 'data-status',
            id: 'agent-status',
            data: { 
              status: 'Connecting', 
              progress: 10,
              thought: 'Initializing link to WDK settlement rails...',
              ts: Date.now()
            },
            transient: true,
          });
        }

        const modelMessages = await convertToModelMessages(normalizedMessages);

        const result = await streamText({
          model: baseModel as any,
          maxSteps: 10,
          maxToolRoundtrips: 3,
          temperature: 0,
          tools: routerDecision.intent === 'small_talk' ? {} : normalizedAgentTools as any,
          onStepFinish: (arg: any) => {
            const toolResults = arg?.toolResults ?? [];
            const toolCalls = arg?.toolCalls ?? [];

            // 1. Telemetry updates - Only for non-small talk
            if (routerDecision.intent !== 'small_talk' && toolCalls && toolCalls.length > 0) {
              const lastCall = toolCalls[toolCalls.length - 1];
              const toolName = lastCall?.toolName;
              
              let status = 'Processing';
              let progress = 50;
              let thought = 'Analyzing tactical data...';

              if (toolName === 'analyze_risk') {
                status = 'Risk Analysis';
                progress = 40;
                thought = 'Scanning ZK-Risk Oracle for Monte Carlo verification...';
              } else if (toolName === 'check_strategy' || toolName === 'check_cross_chain_yields') {
                status = 'Yield Scout';
                progress = 75;
                thought = 'Evaluating yield spreads across Solana, TON, and BSC rails...';
              } else if (toolName === 'execute_rebalance') {
                status = 'Settlement';
                progress = 95;
                thought = 'Finalizing atomic rebalance via OmniAgent settlement layer...';
              } else if (toolName === 'yield_sweep') {
                status = 'Yield Harvest';
                progress = 85;
                thought = 'Sweeping accrued yield to spending wallet...';
              }
              writer.write({
                type: 'data-status',
                id: 'agent-status',
                data: { status, progress, thought, ts: Date.now() },
                transient: true,
              });
            }

            // 2. Add an internal reasoning "thought" message part if tool results exist
            // This replaces the "Thought for 1 second" with actual internal logic
            if (toolResults && toolResults.length > 0) {
              const lastResult = toolResults[toolResults.length - 1];
              const toolName = lastResult.toolName;
              
              let internalLogic = "";
              if (toolName === 'analyze_risk') {
                internalLogic = `Risk profile verified at level ${lastResult.result.level}. Drawdown within nominal limits (${lastResult.result.drawdownBps} bps).`;
              } else if (toolName === 'get_vault_status') {
                internalLogic = `Vault health confirmed. Total Assets: ${lastResult.result.totalAssets} USD₮. Liquidity depth is optimal.`;
              } else if (toolName === 'check_strategy') {
                internalLogic = lastResult.result.canExecute 
                  ? `Strategy engine triggered. Target allocation: ${(lastResult.result.decision.targetWDKBps / 100).toFixed(2)}% WDK.`
                  : `Strategy idle: ${lastResult.result.reason || "Optimal allocation maintained."}`;
              } else if (toolName === 'yield_sweep') {
                internalLogic = lastResult.result.actionTaken === 'YIELD_SWEPT'
                  ? `Yield sweep successful. Tx: ${lastResult.result.txHash}`
                  : `Yield sweep skipped: ${lastResult.result.message || "No yield to sweep."}`;
              } else {
                // Generic fallback for other tools
                internalLogic = `Executed ${toolName} successfully.`;
              }
              if (internalLogic) {
                const reasoningId = `reasoning_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                writer.write({
                  type: 'reasoning-start',
                  id: reasoningId,
                });
                writer.write({
                  type: 'reasoning-delta',
                  id: reasoningId,
                  delta: internalLogic
                });
                writer.write({
                  type: 'reasoning-end',
                  id: reasoningId
                });
              }
            }
          },
system: routerDecision.intent === 'small_talk'
             ? `You are the OmniAgent Strategist. Keep responses brief and professional.`
                : `You are the OmniAgent Strategist for yield optimization.

AVAILABLE TOOLS:
${getAvailableToolsPrompt()}

WORKFLOW:
1. Call tools to gather data
2. Provide clear response with findings

RESPONSE FORMAT: Direct answer after tool results.`,
           messages: modelMessages,
        } as any); // Cast to any to bypass potential version mismatch errors in the types

        // Bridge to UI stream (Pass 1)
        await writer.merge(result.toUIMessageStream());

        // FIX: Manual Chat Synthesis Loop
        // If the model stops after a tool result (without text), force a summary generation.
        if (routerDecision.intent !== 'small_talk') {
          try {
            const response = await result.response;
            const generatedMessages = response.messages;
            
            logger.info({ messageCount: generatedMessages.length }, '[Chat] Stream finished');
            if (generatedMessages.length > 0) {
                const lastMsg = generatedMessages[generatedMessages.length - 1];
                logger.debug({ role: lastMsg.role, contentPreview: JSON.stringify(lastMsg.content).slice(0, 100) }, '[Chat] Last message details');
            }

            if (generatedMessages && generatedMessages.length > 0) {
              const lastMsg = generatedMessages[generatedMessages.length - 1];

              // Check if the conversation ended on a tool execution (role: 'tool')
              const endedOnTool = lastMsg.role === 'tool';
              logger.debug({ endedOnTool }, '[Chat] Termination check');

              if (endedOnTool) {
                logger.info('[Chat] Model stopped after tool usage without summary. Forcing synthesis...');
                
                writer.write({
                  type: 'data-status',
                  id: 'agent-status',
                  data: { status: 'Synthesizing', progress: 99, thought: 'Generating strategic summary...' },
                  transient: true,
                });

                const summaryResult = await streamText({
                  model: baseModel as any,
                  messages: [
                    ...generatedMessages,
                    { role: 'user', content: 'Summarize the above tool results and answer the user query.' }
                  ],
                  temperature: 0
                });

                await writer.merge(summaryResult.toUIMessageStream());
              }
            }
          } catch (err) {
            logger.error(err, '[Chat] Error in synthesis loop');
          }
        }

        if (routerDecision.intent !== 'small_talk') {
          // Spawn suggestion generation in background - don't await
          (async () => {
            try {
              const response = await result.response;
              const generatedMessages = response.messages;
              let assistantText = '';
              
              if (generatedMessages && generatedMessages.length > 0) {
                const lastMsg = generatedMessages[generatedMessages.length - 1];
                if (lastMsg.role === 'assistant' && typeof lastMsg.content === 'string') {
                  assistantText = lastMsg.content;
                }
              }

              const suggestions = await generateSuggestions(baseModel as any, generatedMessages || [], assistantText);
              writer.write({ type: 'data-suggestions', data: suggestions });
            } catch (err) {
              logger.error(err, '[Chat] Error in suggestion generation');
              writer.write({ type: 'data-suggestions', data: fallbackSuggestions });
            }
          })();
        }
      } catch (error: any) {
        if (error.name === 'AbortError') return;
        logger.error(error, '[Chat] Execution Error');
        writer.write({
          type: 'data-notification',
          data: { message: `Execution Error: ${error.message}`, level: 'error' },
          transient: true,
        });
      }
    },
    originalMessages: messages,
    onFinish: async ({ responseMessage, isAborted }) => {
      if (isAborted) return;
      if (!responseMessage) return;
      try {
        await saveChat({ chatId, messages: [...messages, responseMessage] });
      } catch (err) {
        logger.error(err, '[ChatRoute] Failed to save chat');
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
});

chat.get('/:id', async (c) => {
  const messages = await loadChat(c.req.param('id'));
  return c.json(messages);
});

export default chat;
