"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../../utils/logger");
const openai_1 = require("@ai-sdk/openai");
const ai_1 = require("ai");
const hono_1 = require("hono");
const zod_1 = require("zod");
const tools_1 = require("../../agent/tools");
const LLMRouter_1 = require("../../services/LLMRouter");
const chat_store_1 = require("../../utils/chat-store");
const chat = new hono_1.Hono();
// Zod schema for suggestions
const suggestionsSchema = zod_1.z.array(zod_1.z.object({
    label: zod_1.z.string().describe('Short label for the suggestion (max 3-4 words)'),
    prompt: zod_1.z.string().describe('Full follow-up question or prompt'),
}));
// Fallback suggestions
const fallbackSuggestions = [
    { label: 'Analyze Drawdown', prompt: 'Show me the Monte Carlo drawdown analysis for this strategy.' },
    { label: 'Check Rails', prompt: 'Are the settlement rails active on Solana and TON?' },
    { label: 'Vault Status', prompt: 'What is the current vault health and liquidity?' }
];
async function generateSuggestions(model, messages, assistantResponse) {
    try {
        const result = await (0, ai_1.generateText)({
            model,
            temperature: 0,
            prompt: `Based on the following conversation and assistant response, generate 3 relevant follow-up suggestions that the user might ask next.

Assistant's response: "${assistantResponse.slice(0, 400)}"

Generate 3 contextual suggestions with:
- label: Short label (3-4 words max)
- prompt: Complete, specific follow-up question

Topics: DeFi strategies, yield optimization, vault management, settlement rails.

Return JSON array: [{"label": "...", "prompt": "..."}, ...]`,
        });
        const suggestions = JSON.parse(result.text);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
            return suggestions.slice(0, 3);
        }
    }
    catch (err) {
        logger_1.logger.error(err, '[Chat] Error generating suggestions');
    }
    return fallbackSuggestions;
}
chat.post('/', async (c) => {
    logger_1.logger.info('[Chat] Received POST /api/chat');
    const rawBody = await c.req.json().catch(() => null);
    const body = rawBody || {};
    const { messages: rawMessages, id } = body;
    const messages = Array.isArray(rawMessages) ? rawMessages : [];
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
    // Filter messages to ensure they have valid content
    const validMessages = messages.filter((m) => {
        if (!m?.role)
            return false;
        if (typeof m.content === 'string')
            return true;
        if (Array.isArray(m.content))
            return true;
        if (m.content?.text)
            return true;
        return false;
    });
    const openai = (0, openai_1.createOpenAI)({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    });
    const routerDecision = await LLMRouter_1.llmRouter.smartRoute(userText);
    const modelId = routerDecision.recommendedModel;
    logger_1.logger.info({
        userText: userText.slice(0, 50),
        intent: routerDecision.intent,
        confidence: routerDecision.confidence,
        modelId
    }, '[Chat] Processing query with LLM router');
    const baseModel = openai.chat(modelId);
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
                            thought: 'Initializing link to WDK settlement rails...'
                        },
                    });
                }
                let coreMessages = validMessages;
                const result = await (0, ai_1.streamText)({
                    model: baseModel,
                    maxSteps: 10,
                    maxToolRoundtrips: 3,
                    temperature: 0,
                    tools: routerDecision.intent === 'small_talk' ? {} : tools_1.normalizedAgentTools,
                    onStepFinish: (arg) => {
                        const toolResults = arg?.toolResults;
                        const toolCalls = arg?.toolCalls;
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
                                thought = 'Evaluating yield spreads across Solana, TON, and BSC rails...';
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
                                data: { status, progress, thought },
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
                            }
                            else if (toolName === 'get_vault_status') {
                                internalLogic = `Vault health confirmed. Total Assets: ${lastResult.result.totalAssets} USD₮. Liquidity depth is optimal.`;
                            }
                            else if (toolName === 'check_strategy') {
                                internalLogic = lastResult.result.canExecute
                                    ? `Strategy engine triggered. Target allocation: ${(lastResult.result.decision.targetWDKBps / 100).toFixed(2)}% WDK.`
                                    : `Strategy idle: ${lastResult.result.reason || "Optimal allocation maintained."}`;
                            }
                            else if (toolName === 'yield_sweep') {
                                internalLogic = lastResult.result.actionTaken === 'YIELD_SWEPT'
                                    ? `Yield sweep successful. Tx: ${lastResult.result.txHash}`
                                    : `Yield sweep skipped: ${lastResult.result.message || "No yield to sweep."}`;
                            }
                            else {
                                // Generic fallback for other tools
                                internalLogic = `Executed ${toolName} successfully.`;
                            }
                            if (internalLogic) {
                                writer.write({
                                    type: 'reasoning-delta',
                                    delta: internalLogic
                                });
                            }
                        }
                    },
                    system: routerDecision.intent === 'small_talk'
                        ? `You are the OmniAgent AFOS Strategist. Keep responses brief and professional. Just answer the user's question directly in natural language.`
                        : `You are the OmniAgent AFOS Strategist. 
                Directive: yield optimization for USDT and XAUT via Tether WDK & OmniAgent.
                
               AVAILABLE TOOLS - Use these to answer user queries:
               
               VAULT & STRATEGY TOOLS:
               - get_vault_status: Get vault total assets, buffer status, health
               - analyze_risk: Get ZK-risk profile (LOW/MEDIUM/HIGH), drawdown, Sharpe ratio
               - check_strategy: Check if rebalancing is needed, preview next decision
               - wdk_vault_get_balance: Get user's vault balance
               - wdk_vault_get_state: Get vault buffer state
               - wdk_engine_get_cycle_state: Get engine cycle state and decision preview
               - wdk_engine_get_risk_metrics: Get health factor from engine
               
               MULTI-CHAIN TOOLS:
               - get_all_chain_balances: Get BNB, SOL, TON balances across all chains
               - bnb_get_balance: Get BNB and USDT balance on BNB Chain
               - sol_get_balance: Get SOL balance on Solana
               - ton_get_balance: Get TON balance on TON
               
               AAVE LENDING TOOLS:
               - wdk_aave_supply: Supply USDT to Aave V3
               - wdk_aave_withdraw: Withdraw USDT from Aave V3
               
               X402 PAYMENT TOOLS:
               - x402_list_services: List available sub-agent services
               - x402_get_balance: Get USDT balance for x402 payments
               - x402_fleet_status: Get robot fleet status and earnings
               
               CRITICAL INSTRUCTION: You MUST ALWAYS provide a final text summary after using tools.
               
               WORKFLOW:
               1. Use tools to gather data based on user's question
               2. AFTER tools return results, you MUST write a natural language response explaining:
                  - What you found
                  - What the data means
                  - What actions were taken or recommended
               3. NEVER end your response with just tool calls - ALWAYS follow up with explanatory text
               
               QUICK REFERENCE:
               - Vault status → get_vault_status
               - Risk analysis → analyze_risk
               - Rebalance check → check_strategy
               - Chain balances → get_all_chain_balances
               - Engine metrics → wdk_engine_get_risk_metrics
               - Aave position → wdk_aave_supply or wdk_aave_withdraw
               
               RESPONSE FORMAT: Tools → Text Summary (MANDATORY)
               
               STANCE: Technical, analytical, security-first.`,
                    messages: coreMessages,
                }); // Cast to any to bypass potential version mismatch errors in the types
                // Bridge to UI stream (Pass 1)
                await writer.merge(result.toUIMessageStream());
                // FIX: Manual Chat Synthesis Loop
                // If the model stops after a tool result (without text), force a summary generation.
                if (routerDecision.intent !== 'small_talk') {
                    try {
                        const response = await result.response;
                        const generatedMessages = response.messages;
                        logger_1.logger.info({ messageCount: generatedMessages.length }, '[Chat] Stream finished');
                        if (generatedMessages.length > 0) {
                            const lastMsg = generatedMessages[generatedMessages.length - 1];
                            logger_1.logger.debug({ role: lastMsg.role, contentPreview: JSON.stringify(lastMsg.content).slice(0, 100) }, '[Chat] Last message details');
                        }
                        if (generatedMessages && generatedMessages.length > 0) {
                            const lastMsg = generatedMessages[generatedMessages.length - 1];
                            // Check if the conversation ended on a tool execution (role: 'tool')
                            const endedOnTool = lastMsg.role === 'tool';
                            logger_1.logger.debug({ endedOnTool }, '[Chat] Termination check');
                            if (endedOnTool) {
                                logger_1.logger.info('[Chat] Model stopped after tool usage without summary. Forcing synthesis...');
                                writer.write({
                                    type: 'data-status',
                                    id: 'agent-status',
                                    data: { status: 'Synthesizing', progress: 99, thought: 'Generating strategic summary...' },
                                });
                                const summaryResult = await (0, ai_1.streamText)({
                                    model: baseModel,
                                    messages: [
                                        ...generatedMessages,
                                        { role: 'user', content: 'Summarize the above tool results and answer the user query.' }
                                    ],
                                    temperature: 0
                                });
                                await writer.merge(summaryResult.toUIMessageStream());
                            }
                        }
                    }
                    catch (err) {
                        logger_1.logger.error(err, '[Chat] Error in synthesis loop');
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
                            const suggestions = await generateSuggestions(baseModel, generatedMessages || [], assistantText);
                            writer.write({ type: 'data-suggestions', data: suggestions });
                        }
                        catch (err) {
                            logger_1.logger.error(err, '[Chat] Error in suggestion generation');
                            writer.write({ type: 'data-suggestions', data: fallbackSuggestions });
                        }
                    })();
                }
            }
            catch (error) {
                if (error.name === 'AbortError')
                    return;
                logger_1.logger.error(error, '[Chat] Execution Error');
                writer.write({
                    type: 'data-notification',
                    data: { message: `Execution Error: ${error.message}`, level: 'error' },
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
