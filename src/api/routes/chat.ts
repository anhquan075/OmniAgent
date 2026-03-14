import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { env } from '@/config/env';

// We need to export appGraph from loop.ts to use it here
import { appGraph } from '../../agent/services/AgentService';

const chat = new Hono();

chat.post('/', async (c) => {
  const { messages } = await c.req.json();

  return stream(c, async (stream) => {
    const encoder = new TextEncoder();
    
    // Helper to push data chunks (type 2 in protocol)
    const pushData = async (payload: any) => {
      await stream.write(encoder.encode(`2:${JSON.stringify([payload])}\n`));
    };

    // Convert messages to LangChain format
    const langChainMessages = messages.map((m: any) => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    // Dynamic check for streamEvents (JS/TS LangGraph uses streamEvents)
    const streamMethod = appGraph.streamEvents ? 'streamEvents' : (appGraph.stream ? 'stream' : null);
    
    if (!streamMethod) {
      console.error("No valid streaming method found on appGraph");
      return;
    }

    const eventStream = streamMethod === 'streamEvents' 
      ? appGraph.streamEvents({ messages: langChainMessages }, { version: "v2", configurable: { thread_id: "chat-session-default" } })
      : appGraph.stream({ messages: langChainMessages }, { configurable: { thread_id: "chat-session-default" } });

    // Heartbeat mechanism
    const heartbeatInterval = setInterval(async () => {
      await pushData({ type: 'heartbeat', timestamp: Date.now() });
    }, 15000);

    try {
      for await (const event of eventStream) {
        // If using standard stream, the event structure is different
        if (streamMethod === 'stream') {
          // Standard stream just yields state updates
          continue; // Simplification: only text/tools from astreamEvents for now
        }

        const eventType = (event as any).event;

        if (eventType === "on_chain_start" || eventType === "on_node_start") {
          const nodeName = event.name || event.metadata?.langgraph_node;
          if (nodeName && nodeName !== "LangGraph") {
            await pushData({ 
              type: 'status', 
              message: `Agent entering node: ${nodeName.toUpperCase()}`,
              payload: { node: nodeName, timestamp: Date.now() }
            });
          }
        }

        if (eventType === "on_chat_model_stream") {
          const chunk = event.data.chunk;
          if (chunk.content) {
            await stream.write(encoder.encode(`0:${JSON.stringify(chunk.content)}\n`));
          }
        }

        if (eventType === "on_node_end") {
          const output = event.data.output;
          if (output && output.messages && Array.isArray(output.messages)) {
            const lastMessage = output.messages[output.messages.length - 1];
            if (lastMessage && lastMessage.content) {
              await stream.write(encoder.encode(`0:${JSON.stringify(lastMessage.content)}\n`));
            }
          }
        }

        if (eventType === "on_chain_end") {
          const output = event.data.output;
          // Only send if it's a final response and we have messages
          if (output && output.messages && Array.isArray(output.messages)) {
            const lastMessage = output.messages[output.messages.length - 1];
            // If the last message is from the assistant/agent, ensure it's displayed
            if (lastMessage && lastMessage.content) {
              await stream.write(encoder.encode(`0:${JSON.stringify(lastMessage.content)}\n`));
            }
          }
        }

        if (eventType === "on_tool_start") {
          await pushData({ 
            type: 'progress', 
            message: `Executing tool: ${event.name}...`,
            payload: { tool: event.name, args: event.data.input }
          });
        }

        if (eventType === "on_tool_end") {
          await pushData({ 
            type: 'progress', 
            message: `Tool ${event.name} completed.`,
            payload: { tool: event.name, result: event.data.output }
          });
        }
      }
    } finally {
      clearInterval(heartbeatInterval);
    }
  });
});

export default chat;
