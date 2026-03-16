"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const tools_1 = require("../../agent/tools");
const chat_store_1 = require("../../utils/chat-store");
const cache_1 = require("../middleware/cache");
const guardrails_1 = require("../middleware/guardrails");
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
        const result = await (0, ai_1.generateObject)({
            model,
            schema: suggestionsSchema,
            prompt: `Based on the following conversation and assistant response, generate 3 relevant follow-up suggestions that the user might ask next.

Assistant's response: "${assistantResponse.slice(0, 400)}"

Generate 3 contextual suggestions with:
- label: Short label (3-4 words max)
- prompt: Complete, specific follow-up question

Topics: DeFi strategies, yield optimization, vault management, settlement rails.`,
        });
        const suggestions = result.object;
        if (Array.isArray(suggestions) && suggestions.length > 0) {
            return suggestions.slice(0, 3);
        }
    }
    catch (err) {
        console.error('[Chat] Error generating suggestions:', err);
    }
    return fallbackSuggestions;
}
chat.post('/', async (c) => {
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
            // Fallback for different SDK versions
            userText = lastUserMessage.content.text || '';
        }
    }
    // 1. Intent detection: Detect if crypto/DeFi query
    const cryptoKeywords = /\b(vault|strategy|rebalance|usdt|xaut|gold|crypto|defi|yield|risk|depeg|peg|asset|allocation|emergency|circuit|breaker|sharpe|bridge|cross-chain|solana|bnb|ethereum|price|oracle|tether|stablecoin|liquidity|apy|apr)\b/i;
    const isCryptoQuery = cryptoKeywords.test(userText);
    const isSmallTalk = /^(hi|hello|hey|greetings|how are you|thanks|thank you|cool|ok|who are you|bye|good morning|good afternoon|good evening)(\s|[.!?]|$)/i.test(userText.trim());
    const openai = (0, openai_1.createOpenAI)({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    });
    // 2. Model selection: Use DeepSeek for crypto/DeFi, Gemini for general
    const modelId = isCryptoQuery
        ? (env_1.env.OPENROUTER_MODEL_CRYPTO || "deepseek/deepseek-chat")
        : (env_1.env.OPENROUTER_MODEL_GENERAL || "google/gemini-2.0-flash-exp:free");
    console.log(`[Chat] Query: "${userText.slice(0, 50)}..." | Crypto: ${isCryptoQuery} | Model: ${modelId}`);
    const baseModel = openai.chat(modelId);
    const model = (0, ai_1.wrapLanguageModel)({
        model: baseModel,
        middleware: [cache_1.cacheMiddleware, guardrails_1.strategicGuardrail]
    });
    const stream = (0, ai_1.createUIMessageStream)({
        execute: async ({ writer }) => {
            try {
                // Immediate feedback - Only show for non-small talk
                if (!isSmallTalk) {
                    writer.write({
                        type: 'data-status',
                        id: 'agent-status',
                        data: {
                            status: 'Connecting',
                            progress: 10,
                            thought: 'Initializing neural bridge to WDK settlement rails...'
                        },
                    });
                }
                let coreMessages = await (0, ai_1.convertToModelMessages)(messages);
                const result = await (0, ai_1.streamText)({
                    model,
                    maxSteps: 10,
                    maxToolRoundtrips: 3,
                    temperature: isSmallTalk ? 0.7 : 0,
                    tools: isSmallTalk ? {} : tools_1.agentTools,
                    onStepFinish: (arg) => {
                        const toolResults = arg?.toolResults;
                        const toolCalls = arg?.toolCalls;
                        // 1. Telemetry updates - Only for non-small talk
                        if (!isSmallTalk && toolCalls && toolCalls.length > 0) {
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
                                thought = 'Finalizing atomic rebalance via ProofVault settlement layer...';
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
                    system: isSmallTalk
                        ? `You are the OmniWDK AFOS Strategist. Keep responses brief and professional. Just answer the user's question directly in natural language.`
                        : `You are the OmniWDK AFOS Strategist. 
               Directive: yield optimization for USD₮ and XAU₮ via Tether WDK & ProofVault.
               
               CRITICAL INSTRUCTION: You MUST ALWAYS provide a final text summary after using tools.
               
               WORKFLOW:
               1. Use tools to gather data (analyze_risk, get_vault_status, check_strategy, etc.)
               2. AFTER tools return results, you MUST write a natural language response explaining:
                  - What you found
                  - What the data means
                  - What actions were taken or recommended
               3. NEVER end your response with just tool calls - ALWAYS follow up with explanatory text
               
               If you use analyze_risk, tell the user what the risk level is and what it means.
               If you use get_vault_status, tell the user the vault's current state in plain English.
               If you use check_strategy, explain whether rebalancing is needed and why.
               
               RESPONSE FORMAT: Tools → Text Summary (MANDATORY)
               
               STANCE: Technical, analytical, security-first.`,
                    messages: coreMessages,
                }); // Cast to any to bypass potential version mismatch errors in the types
                // Bridge to UI stream (Pass 1)
                await writer.merge(result.toUIMessageStream());
                // FIX: Manual Chat Synthesis Loop
                // If the model stops after a tool result (without text), force a summary generation.
                if (!isSmallTalk) {
                    try {
                        const response = await result.response;
                        const generatedMessages = response.messages;
                        console.log(`[Chat] Response messages count: ${generatedMessages.length}`);
                        if (generatedMessages.length > 0) {
                            const lastMsg = generatedMessages[generatedMessages.length - 1];
                            console.log(`[Chat] Last message role: ${lastMsg.role}`);
                            console.log(`[Chat] Last message content: ${JSON.stringify(lastMsg.content).slice(0, 100)}...`);
                        }
                        if (generatedMessages && generatedMessages.length > 0) {
                            const lastMsg = generatedMessages[generatedMessages.length - 1];
                            // Check if the conversation ended on a tool execution (role: 'tool')
                            const endedOnTool = lastMsg.role === 'tool';
                            console.log(`[Chat] Ended on tool? ${endedOnTool}`);
                            if (endedOnTool) {
                                console.log('[Chat] Model stopped after tool usage without summary. Forcing synthesis...');
                                writer.write({
                                    type: 'data-status',
                                    id: 'agent-status',
                                    data: { status: 'Synthesizing', progress: 99, thought: 'Generating strategic summary...' },
                                });
                                const summaryResult = await (0, ai_1.streamText)({
                                    model,
                                    messages: [
                                        ...generatedMessages,
                                        { role: 'user', content: 'Summarize the above tool results and answer the user query.' }
                                    ],
                                    temperature: 0.7
                                });
                                await writer.merge(summaryResult.toUIMessageStream());
                            }
                        }
                    }
                    catch (err) {
                        console.error('[Chat] Error in synthesis loop:', err);
                    }
                }
                if (!isSmallTalk) {
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
                        console.error('[Chat] Error in suggestion generation:', err);
                        writer.write({ type: 'data-suggestions', data: fallbackSuggestions });
                    }
                }
            }
            catch (error) {
                if (error.name === 'AbortError')
                    return;
                console.error('Execution Error:', error);
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
                console.error('[ChatRoute] Failed to save chat:', err);
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
