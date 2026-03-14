import { Hono } from 'hono';
import { streamText, createUIMessageStream, createUIMessageStreamResponse, UIMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/config/env';

// We need to export appGraph from loop.ts to use it here
import { appGraph } from '../../agent/services/AgentService';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

import { loadChat, saveChat } from '../../utils/chat-store';

const chat = new Hono();

chat.post('/', async (c) => {
  const { messages, id }: { messages: UIMessage[]; id?: string } = await c.req.json();
  const chatId = id || 'default-chat-id';

  const openai = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  });

  const model = openai.chat(process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001");

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

        // Get the last assistant message
        const lastMsg = result.messages[result.messages.length - 1];
        const text = typeof lastMsg.content === 'string' 
          ? lastMsg.content 
          : (Array.isArray(lastMsg.content) ? lastMsg.content.map((p: any) => p.text || '').join('') : '');

        // 3. Final completion status
        writer.write({
          type: 'data-status',
          id: 'agent-status',
          data: { status: 'Strategy Ready', progress: 100 },
        });

        const textStream = await streamText({
          model,
          system: 'You are the TetherProof AFOS Strategist. Focus on USD₮ and XAU₮ yield optimization.',
          messages: [{ role: 'assistant', content: text } as any],
        });

        // Merge the text generation stream into our UI stream
        writer.merge(textStream.toUIMessageStream());
      } catch (error: any) {
        console.error('Execution Error:', error);
        writer.write({
          type: 'data-notification',
          data: { message: `Execution Error: ${error.message}`, level: 'error' },
          transient: true,
        });
      }
    },
    originalMessages: messages,
    onFinish: ({ responseMessage }) => {
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
