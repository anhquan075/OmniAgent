import {
  ExtensionDefinition,
  ExtensionGlobalContext,
  ExtensionRuntimeContext,
  ExtensionToolDefinition,
  ExtensionPromptSection,
  ExtensionLifecycleHooks,
  ExtensionRoute,
  ExtensionCronJob,
  ExtensionChannelDriver,
  ExtensionSettingsField,
  RegisteredExtension,
} from './types';
import { extensionRegistry } from './registry';
import { logger } from '@/utils/logger';
import * as path from 'path';
import * as fs from 'fs';

const EXTENSIONS_DIR = path.resolve(process.cwd(), 'extensions');
const SYSTEM_EXTENSIONS_DIR = path.join(EXTENSIONS_DIR, 'system');
const CUSTOM_EXTENSIONS_DIR = path.join(EXTENSIONS_DIR, 'custom');

class ExtensionStorage {
  private storage: Map<string, Map<string, unknown>> = new Map();

  async get<T = unknown>(extensionId: string, key: string, defaultValue?: T): Promise<T> {
    const extStorage = this.storage.get(extensionId);
    if (!extStorage) return defaultValue as T;
    return (extStorage.get(key) as T) ?? (defaultValue as T);
  }

  async set<T = unknown>(extensionId: string, key: string, value: T): Promise<void> {
    if (!this.storage.has(extensionId)) {
      this.storage.set(extensionId, new Map());
    }
    this.storage.get(extensionId)!.set(key, value);
  }

  async delete(extensionId: string, key: string): Promise<void> {
    this.storage.get(extensionId)?.delete(key);
  }

  async list(extensionId: string): Promise<string[]> {
    return Array.from(this.storage.get(extensionId)?.keys() || []);
  }
}

class ExtensionSettings {
  private settings: Map<string, Record<string, unknown>> = new Map();

  async get<T = unknown>(extensionId: string, key: string, defaultValue?: T): Promise<T> {
    const extSettings = this.settings.get(extensionId) || {};
    return (extSettings[key] as T) ?? (defaultValue as T);
  }

  async set<T = unknown>(extensionId: string, key: string, value: T): Promise<void> {
    if (!this.settings.has(extensionId)) {
      this.settings.set(extensionId, {});
    }
    this.settings.get(extensionId)![key] = value;
  }

  setSchema(extensionId: string, _fields: ExtensionSettingsField[]): void {
    if (!this.settings.has(extensionId)) {
      this.settings.set(extensionId, {});
    }
  }
}

const storage = new ExtensionStorage();
const settings = new ExtensionSettings();

function createExtensionContext(extensionId: string): ExtensionGlobalContext {
  const tools: ExtensionToolDefinition[] = [];
  const promptSections: ExtensionPromptSection[] = [];
  const lifecycleHooks: ExtensionLifecycleHooks[] = [];
  const routes: ExtensionRoute[] = [];
  const cronJobs: ExtensionCronJob[] = [];
  const channelDrivers: ExtensionChannelDriver[] = [];

  return {
    extensionId,
    tools: {
      register: (tool: ExtensionToolDefinition) => {
        tools.push(tool);
      },
      unregister: (toolId: string) => {
        const index = tools.findIndex((t) => t.meta.id === toolId);
        if (index >= 0) tools.splice(index, 1);
      },
      list: () => tools,
    },
    prompt: {
      inject: (section: ExtensionPromptSection) => {
        promptSections.push(section);
      },
      remove: (sectionId: string) => {
        const index = promptSections.findIndex((s) => s.id === sectionId);
        if (index >= 0) promptSections.splice(index, 1);
      },
    },
    settings: {
      schema: (fields: ExtensionSettingsField[]) => {
        settings.setSchema(extensionId, fields);
      },
      get: <T = unknown>(key: string, defaultValue?: T) => settings.get<T>(extensionId, key, defaultValue),
      set: <T = unknown>(key: string, value: T) => settings.set<T>(extensionId, key, value),
    },
    storage: {
      get: <T = unknown>(key: string, defaultValue?: T) => storage.get(extensionId, key, defaultValue),
      set: <T = unknown>(key: string, value: T) => storage.set(extensionId, key, value),
      delete: (key: string) => storage.delete(extensionId, key),
      list: () => storage.list(extensionId),
    },
    lifecycle: {
      register: (hooks: ExtensionLifecycleHooks) => {
        lifecycleHooks.push(hooks);
      },
    },
    routes: {
      register: (route: ExtensionRoute) => {
        routes.push(route);
      },
    },
    cron: {
      register: (job: ExtensionCronJob) => {
        cronJobs.push(job);
      },
      unregister: (name: string) => {
        const index = cronJobs.findIndex((j) => j.name === name);
        if (index >= 0) cronJobs.splice(index, 1);
      },
    },
    channels: {
      registerDriver: (driver: ExtensionChannelDriver) => {
        channelDrivers.push(driver);
      },
    },
    events: {
      emit: (_event: string, _data: unknown) => {},
      on: (_event: string, _handler: (data: unknown) => void) => {},
      off: (_event: string, _handler: (data: unknown) => void) => {},
    },
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => 
        logger.info({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
      warn: (message: string, meta?: Record<string, unknown>) => 
        logger.warn({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
      error: (message: string, meta?: Record<string, unknown>) => 
        logger.error({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
      debug: (message: string, meta?: Record<string, unknown>) => 
        logger.debug({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
    },
    agent: {
      getWalletAddress: async () => '',
      getHealthFactor: async () => '0',
      getTotalEarned: async () => '0',
    },
  };
}

function createRuntimeContext(extensionId: string): ExtensionRuntimeContext {
  return {
    extensionId,
    extensionSettings: {},
  extensionStorage: {
    get: <T = unknown>(key: string, defaultValue?: T) => storage.get(extensionId, key, defaultValue),
    set: <T = unknown>(key: string, value: T) => storage.set(extensionId, key, value),
  },
    agent: {
      walletAddress: '',
      healthFactor: '0',
      totalEarned: '0',
      currentCycle: 0,
    },
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => 
        logger.info({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
      warn: (message: string, meta?: Record<string, unknown>) => 
        logger.warn({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
      error: (message: string, meta?: Record<string, unknown>) => 
        logger.error({ extensionId, ...meta }, `[Extension:${extensionId}] ${message}`),
    },
  };
}

async function loadExtensionFromPath(extensionPath: string, isSystem = false): Promise<void> {
  const indexPath = path.join(extensionPath, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    logger.warn({ extensionPath }, '[ExtensionLoader] No index.ts found');
    return;
  }

  try {
    const module = await import(indexPath);
    const definition = (module as { default?: ExtensionDefinition }).default || module as ExtensionDefinition;

    if (!definition.meta?.id) {
      logger.warn({ extensionPath }, '[ExtensionLoader] Extension missing meta.id');
      return;
    }

    logger.info({ extensionId: definition.meta.id }, '[ExtensionLoader] Loading extension');

    const ctx = createExtensionContext(definition.meta.id);
    
    if (definition.setup) {
      await definition.setup(ctx);
    }

    const registered: RegisteredExtension = {
      definition,
      settings: { enabled: true, config: {} },
      tools: [],
      promptSections: [],
      lifecycleHooks: {} as ExtensionLifecycleHooks,
      routes: [],
      cronJobs: [],
      channelDrivers: [],
      enabled: true,
      loadedAt: new Date(),
    };

    extensionRegistry.register(registered);
    logger.info({ extensionId: definition.meta.id }, '[ExtensionLoader] Extension loaded');
  } catch (err) {
    logger.error({ err, extensionPath }, '[ExtensionLoader] Failed to load extension');
  }
}

async function loadExtensions(): Promise<void> {
  logger.info('[ExtensionLoader] Starting extension discovery');

  if (fs.existsSync(SYSTEM_EXTENSIONS_DIR)) {
    const systemDirs = fs.readdirSync(SYSTEM_EXTENSIONS_DIR);
    for (const dir of systemDirs) {
      const extPath = path.join(SYSTEM_EXTENSIONS_DIR, dir);
      if (fs.statSync(extPath).isDirectory()) {
        await loadExtensionFromPath(extPath, true);
      }
    }
  }

  if (fs.existsSync(CUSTOM_EXTENSIONS_DIR)) {
    const customDirs = fs.readdirSync(CUSTOM_EXTENSIONS_DIR);
    for (const dir of customDirs) {
      const extPath = path.join(CUSTOM_EXTENSIONS_DIR, dir);
      if (fs.statSync(extPath).isDirectory()) {
        await loadExtensionFromPath(extPath, false);
      }
    }
  }

  logger.info(
    { total: extensionRegistry.getAll().length },
    '[ExtensionLoader] Extension loading complete'
  );
}

export { loadExtensions, extensionRegistry, createRuntimeContext };
