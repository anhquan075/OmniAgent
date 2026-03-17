import { Hono } from 'hono';
import { ToolRegistry } from '../../mcp-server/tool-registry.js';
import { bnbTools, handleBnbTool } from '../../mcp-server/handlers/bnb-tools.js';
import { solanaTools, handleSolanaTool } from '../../mcp-server/handlers/solana-tools.js';
import { tonTools, handleTonTool } from '../../mcp-server/handlers/ton-tools.js';
import { wdkTools, handleWdkTool } from '../../mcp-server/handlers/wdk-tools.js';
import { x402Tools, handleX402Tool } from '../../mcp-server/handlers/x402-tools.js';
import { erc4337Tools, handleErc4337Tool } from '../../mcp-server/handlers/erc4337-tools.js';
import { McpExecutionContext, McpTool } from '../../mcp-server/types/mcp-protocol.js';
import { logger } from '@/utils/logger';

const mcpRoute = new Hono();

const registry = new ToolRegistry();

function initMcpTools() {
  for (const tool of bnbTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleBnbTool(tool.name, params, context);
    });
  }
  for (const tool of solanaTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleSolanaTool(tool.name, params, context);
    });
  }
  for (const tool of tonTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleTonTool(tool.name, params, context);
    });
  }
  for (const tool of wdkTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleWdkTool(tool.name, params, context);
    });
  }
  for (const tool of x402Tools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleX402Tool(tool.name, params, context);
    });
  }
  for (const tool of erc4337Tools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleErc4337Tool(tool.name, params, context);
    });
  }
  console.error(`[MCP] Registered ${registry.getToolCount()} tools`);
}

initMcpTools();

mcpRoute.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { jsonrpc, id, method, params } = body;

    logger.info({ method, id }, '[MCP] Received request');
    logger.debug({ body: JSON.stringify(body).slice(0, 200) }, '[MCP] Request body');

    const userWalletAddress = c.req.header('x-user-wallet') || null;
    const isConnectedWallet = c.req.header('x-wallet-connected') === 'true';

    if (method === 'tools/list') {
      logger.info('[MCP] Listing tools');
      const tools = registry.getAllTools();
      
      const toolsWithContext = tools.map((tool: McpTool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...tool.inputSchema.properties,
            ...(userWalletAddress ? { _userWallet: { type: 'string', description: 'User wallet address', default: userWalletAddress } } : {})
          }
        }
      }));

      logger.info({ toolCount: tools.length }, '[MCP] Returning tools list');
      return c.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: toolsWithContext,
          _meta: {
            userWallet: userWalletAddress,
            walletConnected: isConnectedWallet,
            mode: userWalletAddress ? 'user_wallet' : 'agent_wallet'
          }
        },
      });
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const requestId = String(id || `req-${Date.now()}`);

      logger.info({ tool: name, args: JSON.stringify(args).slice(0, 100), requestId }, '[MCP] Executing tool');

      const context: McpExecutionContext = {
        requestId,
        timestamp: Date.now(),
        policyGuardEnabled: true,
        userWallet: userWalletAddress || undefined,
        walletMode: userWalletAddress ? 'user' : 'agent'
      };

      const result = await registry.executeTool(name, args || {}, context);

      if (!result.success) {
        logger.error({ tool: name, error: result.error }, '[MCP] Tool execution failed');
        return c.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: result.error?.message || 'Unknown error',
          },
        });
      }

      logger.info({ tool: name, success: true }, '[MCP] Tool executed successfully');
      return c.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...(result.data || {}),
                _meta: {
                  executedBy: userWalletAddress ? 'user_wallet' : 'agent_wallet',
                  userWallet: userWalletAddress || null,
                  walletConnected: isConnectedWallet
                }
              }, null, 2),
            },
          ],
        },
      });
    }

    logger.warn({ method }, '[MCP] Unknown method');
    return c.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  } catch (error) {
    return c.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
});

mcpRoute.get('/', (c) => {
  const userWalletAddress = c.req.header('x-user-wallet') || null;
  const isConnectedWallet = c.req.header('x-wallet-connected') === 'true';
  
  return c.json({
    name: 'omniwdk-mcp-server',
    version: '1.0.0',
    description: 'OmniWDK Multi-VM MCP Server',
    tools: registry.getToolCount(),
    _meta: {
      mode: userWalletAddress ? 'user_wallet' : 'agent_wallet',
      userWallet: userWalletAddress,
      walletConnected: isConnectedWallet
    }
  });
});

export default mcpRoute;
