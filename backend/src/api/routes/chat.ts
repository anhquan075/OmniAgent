import { logger } from '@/utils/logger';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, streamText } from 'ai';
import { Hono } from 'hono';
import { z } from 'zod';

import { normalizedAgentTools } from '@/agent/tools';
import { llmRouter } from '@/services/LLMRouter';
import { loadChat, saveChat } from '../../utils/chat-store';
import { updateAgentReasoning, updateX402Revenue, addRecentAction } from './stats';

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
  { label: 'Vault Status', prompt: 'What is the current vault status and liquidity?' },
  { label: 'Check Yields', prompt: 'What are the best cross-chain yield opportunities right now?' },
  { label: 'Risk Analysis', prompt: 'Run a Monte Carlo risk analysis on my current allocation.' }
];

interface Suggestion {
  label: string;
  prompt: string;
}

async function generateSuggestions(
  openrouter: ReturnType<typeof createOpenRouter>,
  modelId: string,
  messages: any[],
  intent: string
): Promise<Suggestion[]> {
  const conversationContext = messages
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => {
      let content = '';
      if (typeof m.content === 'string') {
        content = m.content;
      } else if (Array.isArray(m.parts)) {
        content = m.parts
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ');
      } else if (m.content?.text) {
        content = m.content.text;
      }
      return `[${m.role.toUpperCase()}]: ${content}`;
    })
    .join('\n');

  const truncatedContext = conversationContext.slice(-2000);
  const availableToolsContext = getAvailableToolsPrompt();

  try {
    const result = await generateText({
      model: openrouter.chat(modelId),
      temperature: 0.7,
      system: `You are a helpful assistant that generates 3 short follow-up questions the user might want to ask next.

Based on the conversation context, generate 3 contextual follow-up questions that would naturally follow from what was discussed.

AVAILABLE TOOLS:
${availableToolsContext}

Rules:
- Each question should be specific and actionable
- Questions should be 5-10 words as labels, with full question as prompt
- Vary the questions - mix of tool-based actions AND non-tool follow-ups (explanations, clarifications, deeper understanding)
- Questions should feel like natural next steps in the conversation
- Examples of non-tool suggestions: "Explain how this works", "What are the risks?", "Why did you choose this approach?"
- Examples of tool suggestions: "Check my vault balance", "Show recent transactions"
- Mix: aim for 1-2 tool-based and 1-2 non-tool suggestions based on context

Return JSON array: [{"label": "Short Label", "prompt": "Full question here?"}, ...]`,
      prompt: `CONVERSATION CONTEXT:\n${truncatedContext}\n\nINTENT: ${intent}\n\nGenerate 3 follow-up questions the user might naturally ask next. Mix tool-based and non-tool suggestions.`,
    });

    let text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      try {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          return suggestions.slice(0, 3);
        }
      } catch {
        logger.warn({ rawText: text.slice(0, 200) }, '[Chat] JSON parse failed, using fallback');
      }
    } else {
      logger.warn({ rawText: text.slice(0, 200) }, '[Chat] No JSON array found in suggestion response');
    }
  } catch (err: any) {
    const isRateLimit = err?.status === 429 || err?.message?.includes('429');
    if (isRateLimit) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const retry = await generateText({
          model: openrouter.chat(modelId),
          temperature: 0.7,
          system: `You are a helpful assistant that generates 3 short follow-up questions the user might want to ask next.

Based on the conversation context, generate 3 contextual follow-up questions.

AVAILABLE TOOLS:
${availableToolsContext}

Rules:
- Mix tool-based actions AND non-tool follow-ups (explanations, clarifications)
- Non-tool examples: "Explain how this works", "What are the risks?", "Why this approach?"
- Tool examples: "Check my balance", "Show recent transactions"
- Aim for 1-2 tool-based and 1-2 non-tool suggestions

Return JSON array only: [{"label": "Short Label", "prompt": "Full question here?"}, ...]`,
          prompt: `CONVERSATION CONTEXT:\n${truncatedContext}\n\nINTENT: ${intent}\n\nGenerate 3 follow-up questions. Mix tool-based and non-tool. Return JSON array only.`,
        });
        let text = retry.text.trim();
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          const suggestions = JSON.parse(match[0]);
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            return suggestions.slice(0, 3);
          }
        }
      } catch (retryErr) {
        logger.error(retryErr, '[Chat] Suggestion retry also failed');
      }
    } else {
      logger.error({ err, truncatedContext: truncatedContext.slice(0, 100) }, '[Chat] Error generating suggestions');
    }
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
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        return { ...m, parts: [{ type: 'text' as const, text: m.content }] };
      } else if (Array.isArray(m.content)) {
        return { ...m, parts: m.content.map((c: any) => 
          typeof c === 'string' ? { type: 'text' as const, text: c } : c
        )};
      } else if (m.content?.text) {
        return { ...m, parts: [{ type: 'text' as const, text: m.content.text }] };
      }
    }
    return m;
  });

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const routerDecision = await llmRouter.smartRoute(userText);
  const modelId = routerDecision.recommendedModel;
  
  logger.info({ 
    userText: userText.slice(0, 50), 
    intent: routerDecision.intent,
    confidence: routerDecision.confidence,
    modelId 
  }, '[Chat] Processing query with LLM router');
  
  const baseModel = openrouter.chat(modelId);

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

        const supportsNativeReasoning = modelId.includes('grok') || (modelId.includes('claude') && modelId.includes('thinking'));
        const result = await streamText({
          model: baseModel,
          maxSteps: 10,
          maxToolRoundtrips: 3,
          temperature: 0,
          tools: routerDecision.intent === 'small_talk' ? {} : normalizedAgentTools as any,
          providerOptions: supportsNativeReasoning ? {
            openrouter: {
              reasoning: { effort: 'high' },
            },
          } : undefined,
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
                thought = 'Evaluating yield spreads across Solana, TON, and Ethereum/Sepolia rails...';
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
              
              updateAgentReasoning(thought);
              
              const lastResult = toolResults[toolResults.length - 1];
              if (lastResult) {
                const actionTitle = toolName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                let actionDesc = '';
                
                if (lastResult.result?.actionTaken) {
                  actionDesc = `Action: ${lastResult.result.actionTaken}`;
                } else if (lastResult.result?.status) {
                  actionDesc = `Status: ${lastResult.result.status}`;
                } else if (lastResult.result?.txHash) {
                  actionDesc = `Tx: ${lastResult.result.txHash.slice(0, 16)}...`;
                } else if (lastResult.result?.success !== undefined) {
                  actionDesc = lastResult.result.success ? 'Completed successfully' : 'Failed';
                }
                
                if (actionDesc) {
                  addRecentAction({ title: actionTitle, description: actionDesc, hash: lastResult.result?.txHash });
                }
                
                if (toolName?.includes('x402') && lastResult?.result?.amount) {
                  updateX402Revenue(lastResult.result.amount);
                }
              }
            }
          },
           system: routerDecision.intent === 'small_talk'
              ? `You are the OmniAgent Strategist. Keep responses brief and professional.`
                 : `You are the OmniAgent Strategist for yield optimization.

AVAILABLE TOOLS:
${getAvailableToolsPrompt()}

CRITICAL RULES:
1. When a tool returns data with success:true, USE that data to answer the user's question directly
2. Never ask for information that a tool already provided in its result
3. Tool results contain the answer — read the result data and respond with it
4. If sepolia_get_balance returns nativeBalance, display it: "Your Sepolia balance is X ETH"
5. Format balances nicely (e.g., "0.35 ETH" not "0.349998639697992143")

WORKFLOW:
1. Call tools to gather data
2. Read the tool result data
3. Respond with the actual data from the tool result

RESPONSE FORMAT: Direct answer with data from tool results.`,
           messages: modelMessages,
        } as any); // Cast to any to bypass potential version mismatch errors in the types

        const streamPromise = writer.merge(result.toUIMessageStream());

        if (routerDecision.intent !== 'small_talk') {
          generateSuggestions(openrouter, modelId, normalizedMessages, routerDecision.intent)
            .then((suggestions) => {
              writer.write({ type: 'data-suggestions', data: suggestions });
            })
            .catch((err) => {
              logger.error(err, '[Chat] Error in suggestion generation');
              writer.write({ type: 'data-suggestions', data: fallbackSuggestions });
            });
        }

        try {
          await streamPromise;
        } catch (streamError: any) {
          logger.error(streamError, '[Chat] Stream error');
          const isRateLimit = streamError?.status === 429 || streamError?.message?.includes('429');
          writer.write({
            type: 'data-notification',
            data: { 
              message: isRateLimit 
                ? 'Rate limit reached. Please wait a moment and try again.' 
                : `Stream Error: ${streamError.message}`,
              level: 'error' 
            },
            transient: true,
          });
        }

        if (routerDecision.intent !== 'small_talk') {
          try {
            const response = await result.response;
            const generatedMessages = response.messages;
            
            if (generatedMessages && generatedMessages.length > 0) {
              const lastMsg = generatedMessages[generatedMessages.length - 1];
              const endedOnTool = lastMsg.role === 'tool';

              if (endedOnTool) {
                writer.write({
                  type: 'data-status',
                  id: 'agent-status',
                  data: { status: 'Complete', progress: 100, thought: 'Analysis complete.' },
                  transient: true,
                });
              }
            }
          } catch (err) {
            logger.error(err, '[Chat] Error in post-stream');
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') return;
        logger.error(error, '[Chat] Execution Error');
        const isRateLimit = error?.status === 429 || error?.message?.includes('429');
        writer.write({
          type: 'data-notification',
          data: { 
            message: isRateLimit 
              ? 'Rate limit reached. Please wait a moment and try again.' 
              : `Execution Error: ${error.message}`,
            level: 'error' 
          },
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

// Intent parsing endpoint - natural language to DeFi actions
import { getNLCommandParser } from '../../agent/services/NLCommandParser';
import { IntentExecutor, MCPClient } from '../../agent/services/IntentExecutor';

const nlParser = getNLCommandParser();

// Create MCP client that calls the local MCP endpoint
const localMCPClient: MCPClient = {
  async call(method: string, params: Record<string, any>) {
    const response = await fetch('http://localhost:3001/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: method, arguments: params }
      })
    });
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message || 'MCP call failed');
    }
    return result.result;
  }
};

chat.post('/intent', async (c) => {
  try {
    const { message, walletAddress, riskProfile } = await c.req.json();

    if (!message) {
      return c.json({ error: 'Message is required' }, 400);
    }

    if (!walletAddress) {
      return c.json({ error: 'Wallet address is required' }, 400);
    }

    // Parse intent from natural language
    const intent = await nlParser.parseIntent(message, {
      walletAddress,
      riskProfile
    });

    logger.info({ intent, walletAddress }, '[Chat/Intent] Parsed intent');

    // Low confidence - ask for clarification
    if (intent.confidence < 0.5) {
      return c.json({
        type: 'clarification',
        message: `I'm not sure what you mean. Here are some things I can help with:\n\n- **Protect my savings** - Move funds to stablecoins\n- **Grow my money** - Earn yield on DeFi protocols\n- **Send funds** - Transfer or bridge tokens\n- **Check balance** - View your portfolio`,
        suggestions: [
          { label: 'Protect Savings', prompt: 'protect my savings' },
          { label: 'Grow Money', prompt: 'grow my money' },
          { label: 'Check Balance', prompt: 'what is my balance' }
        ]
      });
    }

    // Medium confidence - ask for confirmation
    if (intent.confidence < 0.8) {
      const actionDescription = getActionDescription(intent);
      return c.json({
        type: 'confirmation',
        message: `I think you want to: **${actionDescription}**\n\nShould I proceed?`,
        intent,
        requiresConfirmation: true
      });
    }

    // High confidence - execute directly for queries, confirm for actions
    if (intent.type === 'QUERY') {
      const executor = new IntentExecutor(localMCPClient, walletAddress);
      const result = await executor.execute(intent);
      return c.json({
        type: 'executed',
        intent,
        result
      });
    }

    // For HEDGE/YIELD/TRANSFER actions, return the intent for confirmation
    const actionDescription = getActionDescription(intent);
    return c.json({
      type: 'intent_ready',
      message: `Ready to execute: **${actionDescription}**\n\nClick confirm to proceed.`,
      intent,
      requiresConfirmation: true
    });

  } catch (error: any) {
    logger.error(error, '[Chat/Intent] Error parsing intent');
    return c.json({
      type: 'error',
      message: `Failed to parse intent: ${error.message}`
    }, 500);
  }
});

// Execute confirmed intent
chat.post('/intent/execute', async (c) => {
  try {
    const { intent, walletAddress } = await c.req.json();

    if (!intent || !walletAddress) {
      return c.json({ error: 'Intent and wallet address required' }, 400);
    }

    const executor = new IntentExecutor(localMCPClient, walletAddress);
    const result = await executor.execute(intent);

    return c.json({
      type: 'executed',
      intent,
      result
    });

  } catch (error: any) {
    logger.error(error, '[Chat/Intent] Error executing intent');
    return c.json({
      type: 'error',
      message: `Execution failed: ${error.message}`
    }, 500);
  }
});

function getActionDescription(intent: any): string {
  const descriptions: Record<string, string> = {
    move_to_stablecoin: 'Move funds to USDT (stablecoin)',
    move_to_gold: 'Move funds to XAUT (gold-backed)',
    supply_to_aave: 'Deposit to Aave for yield',
    optimize_yield: 'Optimize yield across protocols',
    transfer_usdt: `Transfer ${intent.params.amount || 'funds'} to ${intent.params.recipient || 'specified address'}`,
    bridge: `Bridge funds to ${intent.params.chain || 'another chain'}`,
    get_balance: 'Check wallet balance',
    get_yield_info: 'View yield information',
    get_portfolio: 'Show portfolio',
    get_risk_metrics: 'View risk metrics'
  };
  return descriptions[intent.action] || `Execute ${intent.action}`;
}

export default chat;
