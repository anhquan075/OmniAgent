import { McpTool, ToolHandler, McpExecutionContext, McpToolResult, MCP_ERRORS } from './types/mcp-protocol';

/**
 * Dangerous tools that must be blocked from LLM access.
 * These tools bypass on-chain PolicyGuard and can drain funds.
 * Pattern borrowed from shll-safe-agent's WDK_BLOCKED_TOOLS.
 */
export const DANGEROUS_TOOLS = new Set([
  // Direct write tools that bypass safety checks
  'sign',                    // Arbitrary message signing
  'rawTransaction',          // Raw unsigned transaction
  'broadcastTransaction',    // Broadcast without validation
]);

/**
 * Tools that require explicit risk acknowledgment.
 * LLM can see these but execution will prompt for confirmation.
 */
export const HIGH_RISK_TOOLS = new Set([
  'wdk_vault_withdraw',
  'wdk_engine_execute',
  'x402_payForService',
  'aa_sendUserOperation',
]);

export class ToolRegistry {
  private tools: Map<string, { tool: McpTool; handler: ToolHandler }> = new Map();
  private blockedTools: Set<string> = new Set(DANGEROUS_TOOLS);
  private version: string = '1.0.0';

  registerTool(tool: McpTool, handler: ToolHandler): void {
    if (this.blockedTools.has(tool.name)) {
      console.log(`  BLOCKED: ${tool.name} — excluded from LLM access (safety)`);
      return;
    }
    this.tools.set(tool.name, { tool, handler });
  }

  getTool(name: string): { tool: McpTool; handler: ToolHandler } | undefined {
    return this.tools.get(name);
  }

  listTools(filter?: { blockchain?: string; riskLevel?: string; category?: string }): McpTool[] {
    let tools = Array.from(this.tools.values()).map(t => t.tool);
    
    if (filter?.blockchain) {
      tools = tools.filter(t => t.blockchain === filter.blockchain);
    }
    if (filter?.riskLevel) {
      tools = tools.filter(t => t.riskLevel === filter.riskLevel);
    }
    if (filter?.category) {
      tools = tools.filter(t => t.category === filter.category);
    }
    
    return tools;
  }

  getAllTools(): McpTool[] {
    return Array.from(this.tools.values()).map(t => t.tool);
  }

  /**
   * List only safe tools (excludes high-risk tools that require confirmation).
   * Use this for autonomous/agent mode where human confirmation isn't available.
   */
  getSafeTools(): McpTool[] {
    return Array.from(this.tools.values())
      .map(t => t.tool)
      .filter(t => !HIGH_RISK_TOOLS.has(t.name));
  }

  /**
   * Check if a tool is blocked
   */
  isBlocked(toolName: string): boolean {
    return this.blockedTools.has(toolName);
  }

  /**
   * Check if a tool is high-risk
   */
  isHighRisk(toolName: string): boolean {
    return HIGH_RISK_TOOLS.has(toolName);
  }

  /**
   * Block a tool dynamically
   */
  blockTool(toolName: string): void {
    this.blockedTools.add(toolName);
    this.tools.delete(toolName);
  }

  private normalizeToolName(name: string): string {
    if (name.includes('_')) {
      const parts = name.split('_');
      return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    }
    return name;
  }

  async executeTool(name: string, params: Record<string, unknown>, context: McpExecutionContext): Promise<McpToolResult> {
    let entry = this.tools.get(name);
    
    if (!entry) {
      const normalized = this.normalizeToolName(name);
      entry = this.tools.get(normalized);
    }
    
    if (!entry) {
      return {
        success: false,
        error: {
          code: MCP_ERRORS.TOOL_NOT_FOUND,
          message: `Tool '${name}' not found`,
        },
      };
    }

    try {
      const result = await entry.handler(params, context);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: {
          code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
          message: `Tool execution failed: ${message}`,
        },
      };
    }
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getToolsByBlockchain(blockchain: string): McpTool[] {
    return this.listTools({ blockchain });
  }

  getToolsByCategory(category: string): McpTool[] {
    return this.listTools({ category });
  }
}

export const globalToolRegistry = new ToolRegistry();
