import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * OpenClaw Agent Framework Client
 * Provides integration with OpenClaw gateway for agent reasoning and orchestration
 * @see https://github.com/openclaw/skills
 */
export interface OpenClawConfig {
  gatewayUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  category: string;
}

export interface NodeInfo {
  nodeId: string;
  type: string;
  name: string;
  version: string;
  status: string;
  capabilities: string[];
}

export interface Session {
  id: string;
  agentId: string;
  createdAt: string;
  lastActiveAt: string;
  status: 'active' | 'paused' | 'completed';
  metadata?: Record<string, unknown>;
}

export interface Capability {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
}

export interface ToolInvocation {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCalls?: ToolInvocation[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: ChatCompletionMessage;
    finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Response types for gateway endpoints
interface ListAgentsResponse {
  agents?: AgentInfo[];
}

interface ToolsCatalogResponse {
  tools?: ToolDefinition[];
}

interface NodeResponse {
  node?: NodeInfo;
}

interface SessionsResponse {
  sessions?: Session[];
}

interface CapabilitiesResponse {
  capabilities?: Capability[];
}

interface ToolInvokeResponse {
  result?: unknown;
}

/**
 * OpenClawClient - Client for OpenClaw agent framework
 * 
 * OpenClaw is an open-source AI agent framework that:
 * - Runs locally on developer machines
 * - Integrates with messaging apps (WhatsApp, Telegram, Slack)
 * - Accepts file-based instructions (skills/prompts)
 * - Supports Model Context Protocol (MCP) for tool integration
 */
export class OpenClawClient {
  private gatewayUrl: string;
  private apiKey: string | undefined;
  private timeout: number;
  private _isConnected: boolean = false;
  private _isAuthenticated: boolean = false;

  constructor(config: OpenClawConfig = {}) {
    this.gatewayUrl = config.gatewayUrl || env.OPENCLAW_GATEWAY_URL || 'https://gateway.openclaw.com/api';
    this.apiKey = config.apiKey || env.OPENCLAW_API_KEY;
    this.timeout = config.timeout || 30000;

    // Connection state - not connected until first request
    this._isConnected = false;
    // Auth requires non-empty API key
    this._isAuthenticated = !!(this.apiKey && this.apiKey.length > 0);

    logger.info({ gatewayUrl: this.gatewayUrl, authenticated: this._isAuthenticated }, '[OpenClawClient] Initialized');
  }

  /**
   * Check if client is connected to gateway
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Check if client has API key authentication
   */
  isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  /**
   * List available agents in the OpenClaw network
   */
  async listAgents(): Promise<AgentInfo[]> {
    logger.debug('[OpenClawClient] Listing agents');

    try {
      const response = await this.makeRequest<ListAgentsResponse>('GET', '/agents');
      return response.agents || [];
    } catch (error) {
      logger.error({ error }, '[OpenClawClient] Failed to list agents');
      return [];
    }
  }

  /**
   * Get catalog of available tools from OpenClaw
   */
  async getToolsCatalog(): Promise<ToolDefinition[]> {
    logger.debug('[OpenClawClient] Getting tools catalog');

    try {
      const response = await this.makeRequest<ToolsCatalogResponse>('GET', '/tools');
      return response.tools || [];
    } catch (error) {
      logger.error({ error }, '[OpenClawClient] Failed to get tools catalog');
      return [];
    }
  }

  /**
   * Get information about a specific node/agent
   */
  async describeNode(nodeId?: string): Promise<NodeInfo | null> {
    logger.debug({ nodeId }, '[OpenClawClient] Describing node');

    try {
      const endpoint = nodeId ? `/nodes/${nodeId}` : '/nodes/self';
      const response = await this.makeRequest<NodeResponse>('GET', endpoint);
      return response.node || null;
    } catch (error) {
      logger.error({ error, nodeId }, '[OpenClawClient] Failed to describe node');
      return null;
    }
  }

  /**
   * List active sessions
   */
  async listSessions(agentId?: string): Promise<Session[]> {
    logger.debug({ agentId }, '[OpenClawClient] Listing sessions');

    try {
      const endpoint = agentId ? `/sessions?agentId=${agentId}` : '/sessions';
      const response = await this.makeRequest<SessionsResponse>('GET', endpoint);
      return response.sessions || [];
    } catch (error) {
      logger.error({ error, agentId }, '[OpenClawClient] Failed to list sessions');
      return [];
    }
  }

  /**
   * Get capabilities of the OpenClaw framework
   */
  async getCapabilities(): Promise<Capability[]> {
    logger.debug('[OpenClawClient] Getting capabilities');

    try {
      const response = await this.makeRequest<CapabilitiesResponse>('GET', '/capabilities');
      return response.capabilities || [];
    } catch (error) {
      logger.error({ error }, '[OpenClawClient] Failed to get capabilities');
      
      // Return default capabilities
      return [
        { name: 'agent-reasoning', description: 'LLM-based agent reasoning', version: '1.0', enabled: true },
        { name: 'tool-invocation', description: 'MCP tool execution', version: '1.0', enabled: true },
        { name: 'session-management', description: 'Multi-turn conversation sessions', version: '1.0', enabled: true },
        { name: 'file-skills', description: 'File-based skill loading', version: '1.0', enabled: true },
      ];
    }
  }

  /**
   * Invoke a specific tool via OpenClaw
   */
  async invokeTool(toolName: string, arguments_: Record<string, unknown> = {}): Promise<unknown> {
    logger.debug({ toolName, arguments: arguments_ }, '[OpenClawClient] Invoking tool');

    try {
      const response = await this.makeRequest<ToolInvokeResponse>('POST', '/tools/invoke', {
        tool: toolName,
        arguments: arguments_,
      });
      return response.result;
    } catch (error) {
      logger.error({ error, toolName }, '[OpenClawClient] Failed to invoke tool');
      throw error;
    }
  }

  /**
   * Chat completions - converse with an OpenClaw agent
   */
  async chatCompletions(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    logger.debug({ model: request.model, messageCount: request.messages.length }, '[OpenClawClient] Chat completions');

    try {
      const response = await this.makeRequest<ChatCompletionResponse>('POST', '/chat/completions', request);
      return response;
    } catch (error) {
      logger.error({ error }, '[OpenClawClient] Failed chat completions');
      throw error;
    }
  }

  /**
   * Make authenticated request to OpenClaw gateway
   */
  private async makeRequest<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${this.gatewayUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          this._isAuthenticated = false;
          throw new Error('OpenClaw authentication failed');
        }
        if (response.status === 404) {
          return {} as T; // Endpoint not found, return empty
        }
        throw new Error(`OpenClaw request failed: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenClaw request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }
}

// Singleton instance
let openClawClientInstance: OpenClawClient | null = null;

export function getOpenClawClient(config?: OpenClawConfig): OpenClawClient {
  if (!openClawClientInstance) {
    openClawClientInstance = new OpenClawClient(config);
  }
  return openClawClientInstance;
}
