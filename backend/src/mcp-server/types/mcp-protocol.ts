/**
 * MCP Protocol Types
 * Model Context Protocol JSON-RPC types for server implementation
 */

import { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Tool Definition
 * Standardized tool format for LLM consumption
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
  outputSchema: McpOutputSchema;
  version: string;
  blockchain: 'bnb' | 'solana' | 'ton';
  riskLevel: 'low' | 'medium' | 'high';
  category: 'wallet' | 'defi' | 'bridge' | 'lending' | 'utility' | 'account-abstraction' | 'x402';
}

/**
 * JSON Schema for tool input
 */
export interface McpInputSchema {
  type: 'object';
  properties: Record<string, McpSchemaProperty>;
  required?: string[];
  description?: string;
}

/**
 * Individual schema property
 */
export interface McpSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: McpSchemaProperty;  // For array type
}

/**
 * JSON Schema for tool output
 */
export interface McpOutputSchema {
  type: 'object';
  properties: Record<string, McpSchemaProperty>;
  description?: string;
}

/**
 * Tool execution result
 */
export interface McpToolResult {
  success: boolean;
  data?: unknown;
  error?: McpError;
}

/**
 * MCP Error codes
 */
export interface McpError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Error Code Constants
 */
export const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom codes
  POLICY_VIOLATION: 403,
  PAYMENT_REQUIRED: 402,
  TOOL_NOT_FOUND: 404,
  TOOL_EXECUTION_FAILED: 500,
} as const;

/**
 * Tool handler function signature
 */
export type ToolHandler = (params: Record<string, unknown>, context: McpExecutionContext) => Promise<McpToolResult>;

/**
 * Execution context passed to each tool
 */
export interface McpExecutionContext {
  requestId: string;
  timestamp: number;
  walletNetwork?: 'bnb' | 'solana' | 'ton';
  policyGuardEnabled: boolean;
  userWallet?: string;
  walletMode?: 'user' | 'agent';
}

/**
 * Tool registry interface
 */
export interface ToolRegistry {
  registerTool(tool: McpTool, handler: ToolHandler): void;
  getTool(name: string): { tool: McpTool; handler: ToolHandler } | undefined;
  listTools(filter?: { blockchain?: string; riskLevel?: string; category?: string }): McpTool[];
  getAllTools(): McpTool[];
}

/**
 * Server configuration
 */
export interface McpServerConfig {
  name: string;
  version: string;
  description?: string;
  transport: 'stdio' | 'http-sse';
  port?: number;
  policyGuardEnabled: boolean;
}

/**
 * Re-export JSONRPC types for external use
 */
export type { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse };
