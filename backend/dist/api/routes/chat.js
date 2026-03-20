"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("@/utils/logger");
const ai_sdk_provider_1 = require("@openrouter/ai-sdk-provider");
const ai_1 = require("ai");
const hono_1 = require("hono");
const zod_1 = require("zod");
const tools_1 = require("@/agent/tools");
const LLMRouter_1 = require("@/services/LLMRouter");
const chat_store_1 = require("../../utils/chat-store");
const stats_1 = require("./stats");
const chat = new hono_1.Hono();
/**
 * Generate AVAILABLE TOOLS section dynamically from tool definitions
 */
function generateAvailableToolsPrompt() {
    const tools = [];
    for (const [name, toolDef] of Object.entries(tools_1.normalizedAgentTools)) {
        // Extract description from tool definition
        const description = toolDef.description || `Tool: ${name}`;
        // Extract parameter schema if available
        let params = '';
        try {
            const paramsObj = toolDef.parameters;
            if (paramsObj && paramsObj._def && paramsObj._def.shape) {
                const shape = paramsObj._def.shape();
                const paramNames = Object.keys(shape).filter(k => k !== 'ZodDefault');
                if (paramNames.length > 0) {
                    params = ` (${paramNames.join(', ')})`;
                }
            }
        }
        catch (e) {
            // Ignore param extraction errors
        }
        tools.push(`- ${name}${params}: ${description}`);
    }
    return tools.join('\n');
}
// Cache the tools prompt (regenerate only if needed)
let cachedToolsPrompt = null;
function getAvailableToolsPrompt() {
    if (!cachedToolsPrompt) {
        cachedToolsPrompt = generateAvailableToolsPrompt();
    }
    return cachedToolsPrompt;
}
// Zod schema for suggestions
const suggestionsSchema = zod_1.z.array(zod_1.z.object({
    label: zod_1.z.string().describe('Short label for the suggestion (max 3-4 words)'),
    prompt: zod_1.z.string().describe('Full follow-up question or prompt'),
}));
// Fallback suggestions
const fallbackSuggestions = [
    { label: 'Vault Status', prompt: 'What is the current vault status and liquidity?' },
    { label: 'Check Yields', prompt: 'What are the best cross-chain yield opportunities right now?' },
    { label: 'Risk Analysis', prompt: 'Run a Monte Carlo risk analysis on my current allocation.' }
];
async function generateSuggestions(openrouter, modelId, messages, intent) {
    const conversationContext = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => {
        let content = '';
        if (typeof m.content === 'string') {
            content = m.content;
        }
        else if (Array.isArray(m.parts)) {
            content = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => p.text)
                .join(' ');
        }
        else if (m.content?.text) {
            content = m.content.text;
        }
        return `[${m.role.toUpperCase()}]: ${content}`;
    })
        .join('\n');
    const truncatedContext = conversationContext.slice(-2000);
    const availableToolsContext = getAvailableToolsPrompt();
    try {
        const result = await (0, ai_1.generateText)({
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
            }
            catch {
                logger_1.logger.warn({ rawText: text.slice(0, 200) }, '[Chat] JSON parse failed, using fallback');
            }
        }
        else {
            logger_1.logger.warn({ rawText: text.slice(0, 200) }, '[Chat] No JSON array found in suggestion response');
        }
    }
    catch (err) {
        const isRateLimit = err?.status === 429 || err?.message?.includes('429');
        if (isRateLimit) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const retry = await (0, ai_1.generateText)({
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
            }
            catch (retryErr) {
                logger_1.logger.error(retryErr, '[Chat] Suggestion retry also failed');
            }
        }
        else {
            logger_1.logger.error({ err, truncatedContext: truncatedContext.slice(0, 100) }, '[Chat] Error generating suggestions');
        }
    }
    return fallbackSuggestions;
}
chat.post('/', async (c) => {
    logger_1.logger.info('[Chat] Received POST /api/chat');
    const rawBody = await c.req.json().catch(() => null);
    const body = rawBody || {};
    const { messages: rawMessages, id } = body;
    const messages = Array.isArray(rawMessages) ? rawMessages : [];
    logger_1.logger.info({ count: messages.length, hasInitial: messages.some(m => m.id === 'initial-1') }, '[Chat] Messages received');
    if (messages.length > 0) {
        logger_1.logger.debug({ firstMsg: JSON.stringify(messages[0]).slice(0, 200) }, '[Chat] First message');
    }
    const chatId = id || 'default-chat-id';
    const lastUserMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    let userText = "";
    if (lastUserMessage) {
        if (typeof lastUserMessage.content === 'string') {
            userText = lastUserMessage.content;
        }
        else if (Array.isArray(lastUserMessage.parts)) {
            userText = lastUserMessage.parts.find((p) => p.type === 'text')?.text || '';
        }
        else if (lastUserMessage.content && typeof lastUserMessage.content === 'object') {
            userText = lastUserMessage.content.text || '';
        }
    }
    const validMessages = messages.filter((m) => {
        if (!m?.role)
            return false;
        if (typeof m.content === 'string')
            return true;
        if (Array.isArray(m.content) && m.content.length > 0)
            return true;
        if (m.content?.text)
            return true;
        if (Array.isArray(m.parts) && m.parts.length > 0)
            return true;
        if (Array.isArray(m.toolInvocations) && m.toolInvocations.length > 0)
            return true;
        return false;
    });
    if (validMessages.length === 0) {
        logger_1.logger.warn({ messages: JSON.stringify(messages).slice(0, 500) }, '[Chat] All messages filtered out');
        return c.json({ error: 'No valid messages provided' }, 400);
    }
    const normalizedMessages = validMessages.map((m) => {
        if (m.role === 'user') {
            if (typeof m.content === 'string') {
                return { ...m, parts: [{ type: 'text', text: m.content }] };
            }
            else if (Array.isArray(m.content)) {
                return { ...m, parts: m.content.map((c) => typeof c === 'string' ? { type: 'text', text: c } : c) };
            }
            else if (m.content?.text) {
                return { ...m, parts: [{ type: 'text', text: m.content.text }] };
            }
        }
        return m;
    });
    const openrouter = (0, ai_sdk_provider_1.createOpenRouter)({
        apiKey: process.env.OPENROUTER_API_KEY,
    });
    const routerDecision = await LLMRouter_1.llmRouter.smartRoute(userText);
    const modelId = routerDecision.recommendedModel;
    logger_1.logger.info({
        userText: userText.slice(0, 50),
        intent: routerDecision.intent,
        confidence: routerDecision.confidence,
        modelId
    }, '[Chat] Processing query with LLM router');
    const baseModel = openrouter.chat(modelId);
    const stream = (0, ai_1.createUIMessageStream)({
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
                const modelMessages = await (0, ai_1.convertToModelMessages)(normalizedMessages);
                const supportsNativeReasoning = modelId.includes('grok') || (modelId.includes('claude') && modelId.includes('thinking'));
                const result = await (0, ai_1.streamText)({
                    model: baseModel,
                    maxSteps: 10,
                    maxToolRoundtrips: 3,
                    temperature: 0,
                    tools: routerDecision.intent === 'small_talk' ? {} : tools_1.normalizedAgentTools,
                    providerOptions: supportsNativeReasoning ? {
                        openrouter: {
                            reasoning: { effort: 'high' },
                        },
                    } : undefined,
                    onStepFinish: (arg) => {
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
                            }
                            else if (toolName === 'check_strategy' || toolName === 'check_cross_chain_yields') {
                                status = 'Yield Scout';
                                progress = 75;
                                thought = 'Evaluating yield spreads across Solana, TON, and Ethereum/Sepolia rails...';
                            }
                            else if (toolName === 'execute_rebalance') {
                                status = 'Settlement';
                                progress = 95;
                                thought = 'Finalizing atomic rebalance via OmniAgent settlement layer...';
                            }
                            else if (toolName === 'yield_sweep') {
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
                            (0, stats_1.updateAgentReasoning)(thought);
                            const lastResult = toolResults[toolResults.length - 1];
                            if (lastResult) {
                                const actionTitle = toolName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                                let actionDesc = '';
                                if (lastResult.result?.actionTaken) {
                                    actionDesc = `Action: ${lastResult.result.actionTaken}`;
                                }
                                else if (lastResult.result?.status) {
                                    actionDesc = `Status: ${lastResult.result.status}`;
                                }
                                else if (lastResult.result?.txHash) {
                                    actionDesc = `Tx: ${lastResult.result.txHash.slice(0, 16)}...`;
                                }
                                else if (lastResult.result?.success !== undefined) {
                                    actionDesc = lastResult.result.success ? 'Completed successfully' : 'Failed';
                                }
                                if (actionDesc) {
                                    (0, stats_1.addRecentAction)({ title: actionTitle, description: actionDesc, hash: lastResult.result?.txHash });
                                }
                                if (toolName?.includes('x402') && lastResult?.result?.amount) {
                                    (0, stats_1.updateX402Revenue)(lastResult.result.amount);
                                }
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
                }); // Cast to any to bypass potential version mismatch errors in the types
                const streamPromise = writer.merge(result.toUIMessageStream());
                if (routerDecision.intent !== 'small_talk') {
                    generateSuggestions(openrouter, modelId, normalizedMessages, routerDecision.intent)
                        .then((suggestions) => {
                        writer.write({ type: 'data-suggestions', data: suggestions });
                    })
                        .catch((err) => {
                        logger_1.logger.error(err, '[Chat] Error in suggestion generation');
                        writer.write({ type: 'data-suggestions', data: fallbackSuggestions });
                    });
                }
                try {
                    await streamPromise;
                }
                catch (streamError) {
                    logger_1.logger.error(streamError, '[Chat] Stream error');
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
                    }
                    catch (err) {
                        logger_1.logger.error(err, '[Chat] Error in post-stream');
                    }
                }
            }
            catch (error) {
                if (error.name === 'AbortError')
                    return;
                logger_1.logger.error(error, '[Chat] Execution Error');
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
            if (isAborted)
                return;
            if (!responseMessage)
                return;
            try {
                await (0, chat_store_1.saveChat)({ chatId, messages: [...messages, responseMessage] });
            }
            catch (err) {
                logger_1.logger.error(err, '[ChatRoute] Failed to save chat');
            }
        },
    });
    return (0, ai_1.createUIMessageStreamResponse)({ stream });
});
chat.get('/:id', async (c) => {
    const messages = await (0, chat_store_1.loadChat)(c.req.param('id'));
    return c.json(messages);
});
exports.default = chat;
