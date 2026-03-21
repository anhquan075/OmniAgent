import { Hono } from 'hono';
import { ToolRegistry } from '../../mcp-server/tool-registry';
import { sepoliaTools, handleSepoliaTool } from '../../mcp-server/handlers/sepolia-tools';
import { polygonTools, handlePolygonTool } from '../../mcp-server/handlers/polygon-tools';
import { arbitrumTools, handleArbitrumTool } from '../../mcp-server/handlers/arbitrum-tools';
import { gnosisTools, handleGnosisTool } from '../../mcp-server/handlers/gnosis-tools';
import { wdkTools, handleWdkTool } from '../../mcp-server/handlers/wdk-tools';
import { wdkProtocolTools, handleWdkProtocolTool } from '../../mcp-server/handlers/wdk-protocol-tools';
import { x402Tools, handleX402Tool } from '../../mcp-server/handlers/x402-tools';
import { erc4337Tools, handleErc4337Tool } from '../../mcp-server/handlers/erc4337-tools';
import { sessionKeyTools, handleSessionKeyTool } from '../../mcp-server/handlers/session-key-tools';
import { marketTools, handleMarketTool } from '../../mcp-server/handlers/market-tools';
import { broadcastSignedTransaction, getPendingTransaction, createPendingTransactionId } from '../../lib/user-wallet-signer';

import { McpExecutionContext, McpTool } from '../../mcp-server/types/mcp-protocol';
import { logger } from '@/utils/logger';

const mcpRoute = new Hono();

const registry = new ToolRegistry();

function initMcpTools() {
  for (const tool of sepoliaTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleSepoliaTool(tool.name, params, context);
    });
  }
  for (const tool of polygonTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handlePolygonTool(tool.name, params, context);
    });
  }
  for (const tool of arbitrumTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleArbitrumTool(tool.name, params, context);
    });
  }
  for (const tool of gnosisTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleGnosisTool(tool.name, params, context);
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
  for (const tool of sessionKeyTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleSessionKeyTool(tool.name, params, context);
    });
  }
  for (const tool of marketTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleMarketTool(tool.name, params, context);
    });
  }
  for (const tool of wdkProtocolTools) {
    registry.registerTool(tool, async (params: Record<string, unknown>, context: McpExecutionContext) => {
      return handleWdkProtocolTool(tool.name, params, context);
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
      const rawToolName = String(name);
      const toolName = rawToolName.trim();
      const requestId = String(id || `req-${Date.now()}`);

      if (rawToolName !== toolName) {
        logger.warn({ raw: rawToolName, trimmed: toolName }, '[MCP] Tool name had whitespace - trimmed');
      }
      logger.info({ tool: toolName, args: JSON.stringify(args).slice(0, 100), requestId }, '[MCP] Executing tool');

      const context: McpExecutionContext = {
        requestId,
        timestamp: Date.now(),
        policyGuardEnabled: true,
        userWallet: userWalletAddress || undefined,
        walletMode: userWalletAddress ? 'user' : 'agent'
      };

      const result = await registry.executeTool(toolName, args || {}, context);

      if (!result.success) {
        logger.error({ tool: toolName, error: result.error }, '[MCP] Tool execution failed');
        return c.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: result.error?.message || 'Unknown error',
          },
        });
      }

      logger.info({ tool: toolName, success: true }, '[MCP] Tool executed successfully');
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
    name: 'omni-agent-mcp-server',
    version: '1.0.0',
    description: 'OmniAgent Multi-VM MCP Server',
    tools: registry.getToolCount(),
    _meta: {
      mode: userWalletAddress ? 'user_wallet' : 'agent_wallet',
      userWallet: userWalletAddress,
      walletConnected: isConnectedWallet
    }
  });
});

mcpRoute.post('/broadcast', async (c) => {
  try {
    const body = await c.req.json();
    const { signedTx, pendingTxId } = body;

    if (!signedTx || !pendingTxId) {
      return c.json({ success: false, error: 'Missing signedTx or pendingTxId' }, 400);
    }

    const result = await broadcastSignedTransaction(signedTx, pendingTxId);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

mcpRoute.get('/pending/:id', (c) => {
  const id = c.req.param('id');
  const pending = getPendingTransaction(id);
  if (!pending) {
    return c.json({ success: false, error: 'Transaction not found or expired' }, 404);
  }
  return c.json({ success: true, data: pending });
});

export default mcpRoute;
