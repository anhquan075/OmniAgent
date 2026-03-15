import { Hono } from 'hono';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, UIMessage, generateId, convertToModelMessages, wrapLanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/config/env';

// We need to export appGraph from loop.ts to use it here
import { appGraph } from '../../agent/services/AgentService';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

import { loadChat, saveChat } from '../../utils/chat-store';
import { cacheMiddleware } from '../middleware/cache';
import { strategicGuardrail } from '../middleware/guardrails';

const chat = new Hono();

chat.post('/', async (c) => {
  const { messages, id }: { messages: UIMessage[]; id?: string } = await c.req.json();
  const chatId = id || 'default-chat-id';

  const openai = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  });

  const baseModel = openai.chat(process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001");
  
  // Apply Middleware: First check cache, then apply safety guardrails
  const model = wrapLanguageModel({
    model: baseModel,
    middleware: [cacheMiddleware, strategicGuardrail]
  });

  // Convert messages to LangChain format
  const langChainMessages = messages.map((m: any) => {
    let content = "";
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (m.parts) {
      content = m.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('');
    }
    return m.role === 'user' ? new HumanMessage(content) : new AIMessage(content);
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        // Assign a unique server-side ID for the upcoming assistant response
        const assistantMessageId = generateId();

        writer.write({
          type: 'start',
          messageId: assistantMessageId,
        });

        // 1. Send initial status (transient)
        writer.write({
          type: 'data-notification',
          data: { message: 'Neural link established. Analyzing vault state...', level: 'info' },
          transient: true,
        });

        // 2. Write persistent progress part
        writer.write({
          type: 'data-status',
          id: 'agent-status',
          data: { status: 'Analyzing Risk', progress: 20 },
        });

        // Invoke the graph
        const result = await appGraph.invoke(
          { messages: langChainMessages }, 
          { configurable: { thread_id: `chat-session-${chatId}` } }
        );

        writer.write({
          type: 'data-status',
          id: 'agent-status',
          data: { status: 'Formulating Strategy', progress: 60 },
        });

        // Format the programmatic findings for the LLM context
        const agentIntel = {
          riskProfile: result.riskProfile,
          strategyDecision: result.decision,
          actionTaken: result.actionTaken,
          transactionHash: result.txHash,
          canExecute: result.canExecute
        };

        // 3. Final completion status
        writer.write({
          type: 'data-status',
          id: 'agent-status',
          data: { status: 'Strategy Ready', progress: 100 },
        });

        const textStream = await streamText({
          model,
          temperature: 0, // Deterministic for consistent DeFi advisory
          abortSignal: c.req.raw.signal,
          system: `You are the OmniWDK AFOS (Autonomous Fixed-income Optimization Strategy) Strategist. 
Your core directive is yield optimization for USD₮ and XAU₮ assets via the Tether WDK (Wallet Development Kit) and ProofVault infrastructure.

OPERATIONAL INTEL:
${JSON.stringify(agentIntel, null, 2)}

STANCE & PERSONA:
- Professional, analytical, and security-focused DeFi strategist.
- Use tactical terminology: "settlement rails", "buffer utilization", "ZK-risk bands", "drawdown bps", "cross-chain liquidity".
- Synthesize the above OPERATIONAL INTEL with the user's request. 
- If an action was taken (e.g., REBALANCED), provide the transaction hash details.
- Always prioritize capital preservation and ZK-verified safety layers.`,
          messages: await convertToModelMessages(messages),
        });

        // Merge the text generation stream into our UI stream
        await writer.merge(textStream.toUIMessageStream({ sendStart: false }));

        // 4. Send dynamic suggestions based on context
        const suggestions = [
          { label: 'Analyze Drawdown', prompt: 'Show me the Monte Carlo drawdown analysis for this strategy.' },
          { label: 'Check Rails', prompt: 'Are the settlement rails active on Solana and TON?' },
          { label: 'Verify ZK-Proof', prompt: 'Provide the latest ZK-risk band verification hash.' }
        ];

        if (agentIntel.actionTaken === 'REBALANCED') {
          suggestions.push({ label: 'View Tx', prompt: `Show details for transaction ${agentIntel.transactionHash}` });
        }

        writer.write({
          type: 'data-suggestions',
          data: suggestions
        });
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream aborted by client');
          return;
        }
        console.error('Execution Error:', error);
        writer.write({
          type: 'data-notification',
          data: { message: `Execution Error: ${error.message}`, level: 'error' },
          transient: true,
        });
      }
    },
    originalMessages: messages,
    onFinish: ({ responseMessage, isAborted }) => {
      if (isAborted) {
        console.log('Chat stream aborted, skipping persistence');
        return;
      }
      // Create full message array including new AI response
      const allMessages = [...messages, responseMessage];
      saveChat({ chatId, messages: allMessages });
    },
  });

  return createUIMessageStreamResponse({ stream });
});

chat.get('/:id', async (c) => {
  const id = c.req.param('id');
  const messages = await loadChat(id);
  return c.json(messages);
});

export default chat;
