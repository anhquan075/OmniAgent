import { EventEmitter } from 'events';
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
import { logger } from '@/utils/logger';
import * as path from 'path';
import * as fs from 'fs';

class ExtensionRegistry extends EventEmitter {
  private extensions: Map<string, RegisteredExtension> = new Map();
  private tools: Map<string, ExtensionToolDefinition> = new Map();
  private promptSections: Map<string, ExtensionPromptSection> = new Map();
  private lifecycleHooks: ExtensionLifecycleHooks[] = [];
  private routes: ExtensionRoute[] = [];
  private cronJobs: Map<string, ExtensionCronJob> = new Map();
  private channelDrivers: Map<string, ExtensionChannelDriver> = new Map();
  private settingsSchemas: Map<string, ExtensionSettingsField[]> = new Map();

  register(extension: RegisteredExtension): void {
    this.extensions.set(extension.definition.meta.id, extension);
    
    for (const tool of extension.tools) {
      this.tools.set(`${extension.definition.meta.id}:${tool.meta.id}`, tool);
    }
    
    for (const section of extension.promptSections) {
      this.promptSections.set(section.id, section);
    }
    
    if (extension.lifecycleHooks) {
      this.lifecycleHooks.push(extension.lifecycleHooks);
    }
    
    for (const route of extension.routes) {
      this.routes.push(route);
    }
    
    for (const cron of extension.cronJobs) {
      this.cronJobs.set(cron.name, cron);
    }
    
    for (const channel of extension.channelDrivers) {
      this.channelDrivers.set(channel.id, channel);
    }

    if (extension.definition.settingsSchema) {
      this.settingsSchemas.set(extension.definition.meta.id, extension.definition.settingsSchema);
    }

    logger.info(
      { extensionId: extension.definition.meta.id, tools: extension.tools.length },
      '[ExtensionRegistry] Registered extension'
    );
    
    this.emit('extension:registered', extension);
  }

  unregister(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (!ext) return;

    for (const tool of ext.tools) {
      this.tools.delete(`${extensionId}:${tool.meta.id}`);
    }
    
    for (const section of ext.promptSections) {
      this.promptSections.delete(section.id);
    }
    
    for (const route of ext.routes) {
      this.routes = this.routes.filter((r) => r.path !== route.path);
    }
    
    for (const cron of ext.cronJobs) {
      this.cronJobs.delete(cron.name);
    }
    
    for (const channel of ext.channelDrivers) {
      this.channelDrivers.delete(channel.id);
    }

    this.extensions.delete(extensionId);
    this.emit('extension:unregistered', extensionId);
  }

  get(extensionId: string): RegisteredExtension | undefined {
    return this.extensions.get(extensionId);
  }

  getAll(): RegisteredExtension[] {
    return Array.from(this.extensions.values());
  }

  getEnabled(): RegisteredExtension[] {
    return this.getAll().filter((ext) => ext.enabled);
  }

  getTool(toolId: string): ExtensionToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  getAllTools(): ExtensionToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsForExtension(extensionId: string): ExtensionToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) =>
      this.tools.has(`${extensionId}:${t.meta.id}`)
    );
  }

  getPromptSections(): ExtensionPromptSection[] {
    return Array.from(this.promptSections.values()).sort((a, b) => 
      (a.priority || 50) - (b.priority || 50)
    );
  }

  getLifecycleHooks(): ExtensionLifecycleHooks[] {
    return this.lifecycleHooks;
  }

  getRoutes(): ExtensionRoute[] {
    return this.routes;
  }

  getCronJobs(): ExtensionCronJob[] {
    return Array.from(this.cronJobs.values());
  }

  getChannelDrivers(): ExtensionChannelDriver[] {
    return Array.from(this.channelDrivers.values());
  }

  getSettingsSchema(extensionId: string): ExtensionSettingsField[] {
    return this.settingsSchemas.get(extensionId) || [];
  }

  enable(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (ext) {
      ext.enabled = true;
      this.emit('extension:enabled', extensionId);
    }
  }

  disable(extensionId: string): void {
    const ext = this.extensions.get(extensionId);
    if (ext) {
      ext.enabled = false;
      this.emit('extension:disabled', extensionId);
    }
  }
}

export const extensionRegistry = new ExtensionRegistry();
