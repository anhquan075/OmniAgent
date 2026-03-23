/**
 * Extension System - Type Definitions
 * 
 * Based on Senken's extension system architecture.
 * Provides a plugin system for extending OmniAgent's capabilities.
 */

import { McpTool, McpExecutionContext } from '@/mcp-server/types/mcp-protocol';

// ============================================================
// Extension Metadata
// ============================================================

export interface ExtensionMeta {
  id: string;                    // Unique identifier (kebab-case)
  name: string;                   // Human-readable name
  description: string;            // What the extension does
  version: string;                // Semver version
  author?: string;                // Optional author info
  tags?: string[];                // Searchable tags
}

export interface ExtensionSettings {
  enabled: boolean;
  config: Record<string, unknown>;
}

// ============================================================
// Extension Definition (what extensions export)
// ============================================================

export interface ExtensionSettingsField {
  id: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  options?: { value: string; label: string }[];  // For select type
  secret?: boolean;  // If true, value is encrypted
}

export interface ExtensionUI {
  /** Panel shown in main content area */
  panel?: string;
  /** Panel shown on left sidebar */
  panelLeft?: string;
  /** Stats bar shown at top */
  statsBar?: string;
  /** Settings page component */
  settings?: string;
}

export interface ExtensionDefinition {
  meta: ExtensionMeta;
  settingsSchema?: ExtensionSettingsField[];
  ui?: ExtensionUI;
  setup?: (ctx: ExtensionGlobalContext) => Promise<void> | void;
  teardown?: (ctx: ExtensionGlobalContext) => Promise<void> | void;
}

// ============================================================
// Extension Context (available during setup)
// ============================================================

export interface ExtensionToolDefinition {
  meta: {
    id: string;
    name: string;
    category: string;
    mode: 'chat' | 'task' | 'both';
    group?: string;
    description?: string;
  };
  description?: string;
  execute: (context: ExtensionRuntimeContext) => Promise<unknown>;
}

export interface ExtensionPromptSection {
  id: string;
  title: string;
  content: string;
  priority?: number;  // Lower = higher priority
}

export interface ExtensionLifecycleHooks {
  onAgentStart?: (ctx: ExtensionGlobalContext) => Promise<void> | void;
  onAgentStop?: (ctx: ExtensionGlobalContext) => Promise<void> | void;
  onCycleStart?: (ctx: ExtensionRuntimeContext) => Promise<void> | void;
  onCycleComplete?: (ctx: ExtensionRuntimeContext, result: unknown) => Promise<void> | void;
  onError?: (ctx: ExtensionRuntimeContext, error: Error) => Promise<void> | void;
}

export interface ExtensionRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (ctx: ExtensionGlobalContext, req: Request) => Promise<Response>;
  auth?: boolean;
}

export interface ExtensionCronJob {
  name: string;
  schedule: string;  // Cron expression
  handler: (ctx: ExtensionGlobalContext) => Promise<void> | void;
  scope: 'global' | 'project';
}

export interface ExtensionChannelDriver {
  id: string;
  name: string;
  description: string;
  credentialSchema?: Record<string, unknown>;
  onStart?: (ctx: ExtensionGlobalContext, credentials: Record<string, unknown>) => Promise<void> | void;
  onStop?: (ctx: ExtensionGlobalContext) => Promise<void> | void;
  send?: (ctx: ExtensionGlobalContext, recipient: string, message: string) => Promise<void>;
  onMessage?: (ctx: ExtensionRuntimeContext, sender: string, message: string) => Promise<void>;
}

export interface ExtensionGlobalContext {
  extensionId: string;
  
  // Tool registration
  tools: {
    register: (tool: ExtensionToolDefinition) => void;
    unregister: (toolId: string) => void;
    list: () => ExtensionToolDefinition[];
  };
  
  // Prompt injection
  prompt: {
    inject: (section: ExtensionPromptSection) => void;
    remove: (sectionId: string) => void;
  };
  
  // Settings management
  settings: {
    schema: (fields: ExtensionSettingsField[]) => void;
    get: <T = unknown>(key: string, defaultValue?: T) => Promise<T>;
    set: <T = unknown>(key: string, value: T) => Promise<void>;
  };
  
  // Storage (persisted key-value)
  storage: {
    get: <T = unknown>(key: string, defaultValue?: T) => Promise<T>;
    set: <T = unknown>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: () => Promise<string[]>;
  };
  
  // Lifecycle hooks
  lifecycle: {
    register: (hooks: ExtensionLifecycleHooks) => void;
  };
  
  // Custom routes
  routes: {
    register: (route: ExtensionRoute) => void;
  };
  
  // Cron jobs
  cron: {
    register: (job: ExtensionCronJob) => void;
    unregister: (name: string) => void;
  };
  
  // Channel integrations
  channels: {
    registerDriver: (driver: ExtensionChannelDriver) => void;
    createPairing?: (ctx: ExtensionGlobalContext, channelId: string, credentials: Record<string, unknown>) => Promise<string>;
  };
  
  // Events
  events: {
    emit: (event: string, data: unknown) => void;
    on: (event: string, handler: (data: unknown) => void) => void;
    off: (event: string, handler: (data: unknown) => void) => void;
  };
  
  // Logging
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
  
  // Agent info
  agent: {
    getWalletAddress: () => Promise<string>;
    getHealthFactor: () => Promise<string>;
    getTotalEarned: () => Promise<string>;
  };
}

// ============================================================
// Extension Runtime Context (available during tool execution)
// ============================================================

export interface ExtensionRuntimeContext {
  extensionId: string;
  extensionSettings: Record<string, unknown>;
  extensionStorage: {
    get: <T = unknown>(key: string, defaultValue?: T) => Promise<T>;
    set: <T = unknown>(key: string, value: T) => Promise<void>;
  };
  
  // Execution context from MCP
  executionContext?: McpExecutionContext;
  
  // Agent state
  agent: {
    walletAddress: string;
    healthFactor: string;
    totalEarned: string;
    currentCycle: number;
  };
  
  // Helper methods
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
  };
}

// ============================================================
// Registered Extension State
// ============================================================

export interface RegisteredExtension {
  definition: ExtensionDefinition;
  settings: ExtensionSettings;
  tools: ExtensionToolDefinition[];
  promptSections: ExtensionPromptSection[];
  lifecycleHooks: ExtensionLifecycleHooks;
  routes: ExtensionRoute[];
  cronJobs: ExtensionCronJob[];
  channelDrivers: ExtensionChannelDriver[];
  enabled: boolean;
  loadedAt: Date;
}

// ============================================================
// Extension System Config
// ============================================================

export interface ExtensionSystemConfig {
  /** Directory containing extension packages */
  extensionsDir: string;
  /** System extensions that cannot be disabled */
  systemExtensions?: string[];
  /** Enable/disable extension loading */
  enabled: boolean;
  /** Load custom extensions (vs built-in) */
  loadCustom: boolean;
}

// ============================================================
// Extension Events
// ============================================================

export type ExtensionEventType = 
  | 'extension:loaded'
  | 'extension:enabled'
  | 'extension:disabled'
  | 'extension:error'
  | 'tool:registered'
  | 'tool:executed'
  | 'cron:triggered'
  | 'lifecycle:triggered';

export interface ExtensionEvent {
  type: ExtensionEventType;
  extensionId: string;
  timestamp: Date;
  data?: unknown;
  error?: Error;
}
