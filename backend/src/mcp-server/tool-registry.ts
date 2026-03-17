import { McpTool, ToolHandler, McpExecutionContext, McpToolResult, MCP_ERRORS } from './types/mcp-protocol';

export class ToolRegistry {
  private tools: Map<string, { tool: McpTool; handler: ToolHandler }> = new Map();
  private version: string = '1.0.0';

  registerTool(tool: McpTool, handler: ToolHandler): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool ${tool.name} already registered, overwriting`);
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

  async executeTool(name: string, params: Record<string, unknown>, context: McpExecutionContext): Promise<McpToolResult> {
    const entry = this.tools.get(name);
    
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
