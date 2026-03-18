import { McpTool, ToolHandler, McpExecutionContext, McpToolResult, MCP_ERRORS } from './types/mcp-protocol';

export class ToolRegistry {
  private tools: Map<string, { tool: McpTool; handler: ToolHandler }> = new Map();
  private version: string = '1.0.0';

  registerTool(tool: McpTool, handler: ToolHandler): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Tool ${tool.name} already registered, overwriting`);
    }
    this.tools.set(tool.name, { tool, handler });
    
    if (tool.name.includes('_')) {
      const camelName = tool.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (camelName !== tool.name && !this.tools.has(camelName)) {
        this.tools.set(camelName, { tool, handler });
      }
    } else if (/[a-z][A-Z]/.test(tool.name)) {
      const snakeName = tool.name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      if (snakeName !== tool.name && !this.tools.has(snakeName)) {
        this.tools.set(snakeName, { tool, handler });
      }
    }
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
