import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extensionRegistry,
} from '../../src/extensions/registry';
import {
  ExtensionDefinition,
  ExtensionToolDefinition,
  ExtensionPromptSection,
  RegisteredExtension,
} from '../../src/extensions/types';

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ExtensionRegistry', () => {
  beforeEach(() => {
    extensionRegistry.getAll().forEach((ext) => {
      extensionRegistry.unregister(ext.definition.meta.id);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register an extension', () => {
      const extension: RegisteredExtension = {
        definition: {
          meta: {
            id: 'test-extension',
            name: 'Test Extension',
            description: 'A test extension',
            version: '1.0.0',
          },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      const retrieved = extensionRegistry.get('test-extension');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.definition.meta.id).toBe('test-extension');
    });

    it('should register tools with extension prefix', () => {
      const tool: ExtensionToolDefinition = {
        meta: {
          id: 'test-tool',
          name: 'Test Tool',
          category: 'testing',
          mode: 'both',
        },
        execute: async () => ({ result: 'ok' }),
      };

      const extension: RegisteredExtension = {
        definition: {
          meta: {
            id: 'test-ext',
            name: 'Test',
            description: 'Test',
            version: '1.0.0',
          },
        },
        settings: { enabled: true, config: {} },
        tools: [tool],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      
      const registeredTool = extensionRegistry.getTool('test-ext:test-tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool?.meta.id).toBe('test-tool');
    });

    it('should register prompt sections', () => {
      const section: ExtensionPromptSection = {
        id: 'test-section',
        title: 'Test Section',
        content: 'Test content',
        priority: 10,
      };

      const extension: RegisteredExtension = {
        definition: {
          meta: {
            id: 'test-ext-prompt',
            name: 'Test Prompt',
            description: 'Test',
            version: '1.0.0',
          },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [section],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      
      const sections = extensionRegistry.getPromptSections();
      expect(sections.length).toBeGreaterThan(0);
      expect(sections.find((s) => s.id === 'test-section')).toBeDefined();
    });
  });

  describe('unregister', () => {
    it('should remove extension and its tools', () => {
      const extension: RegisteredExtension = {
        definition: {
          meta: {
            id: 'remove-test',
            name: 'Remove Test',
            description: 'Test',
            version: '1.0.0',
          },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      expect(extensionRegistry.get('remove-test')).toBeDefined();
      
      extensionRegistry.unregister('remove-test');
      expect(extensionRegistry.get('remove-test')).toBeUndefined();
    });
  });

  describe('enable/disable', () => {
    it('should toggle extension enabled state', () => {
      const extension: RegisteredExtension = {
        definition: {
          meta: {
            id: 'toggle-test',
            name: 'Toggle Test',
            description: 'Test',
            version: '1.0.0',
          },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      expect(extensionRegistry.get('toggle-test')?.enabled).toBe(true);

      extensionRegistry.disable('toggle-test');
      expect(extensionRegistry.get('toggle-test')?.enabled).toBe(false);

      extensionRegistry.enable('toggle-test');
      expect(extensionRegistry.get('toggle-test')?.enabled).toBe(true);
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled extensions', () => {
      const ext1: RegisteredExtension = {
        definition: {
          meta: { id: 'enabled-ext', name: 'E1', description: 'E1', version: '1.0.0' },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      const ext2: RegisteredExtension = {
        definition: {
          meta: { id: 'disabled-ext', name: 'E2', description: 'E2', version: '1.0.0' },
        },
        settings: { enabled: false, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: false,
        loadedAt: new Date(),
      };

      extensionRegistry.register(ext1);
      extensionRegistry.register(ext2);

      const enabled = extensionRegistry.getEnabled();
      expect(enabled.length).toBeGreaterThanOrEqual(1);
      expect(enabled.find((e) => e.definition.meta.id === 'enabled-ext')).toBeDefined();
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      const tool1: ExtensionToolDefinition = {
        meta: { id: 'tool1', name: 'Tool 1', category: 'test', mode: 'both' },
        execute: async () => ({}),
      };

      const tool2: ExtensionToolDefinition = {
        meta: { id: 'tool2', name: 'Tool 2', category: 'test', mode: 'both' },
        execute: async () => ({}),
      };

      const extension: RegisteredExtension = {
        definition: {
          meta: { id: 'multi-tool-ext', name: 'Multi', description: 'Multi', version: '1.0.0' },
        },
        settings: { enabled: true, config: {} },
        tools: [tool1, tool2],
        promptSections: [],
        lifecycleHooks: {},
        routes: [],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      const allTools = extensionRegistry.getAllTools();
      
      expect(allTools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getRoutes', () => {
    it('should return registered routes', () => {
      const extension: RegisteredExtension = {
        definition: {
          meta: { id: 'route-ext', name: 'Routes', description: 'Routes', version: '1.0.0' },
        },
        settings: { enabled: true, config: {} },
        tools: [],
        promptSections: [],
        lifecycleHooks: {},
        routes: [
          {
            method: 'GET',
            path: '/api/test',
            handler: async () => new Response('OK'),
          },
        ],
        cronJobs: [],
        channelDrivers: [],
        enabled: true,
        loadedAt: new Date(),
      };

      extensionRegistry.register(extension);
      const routes = extensionRegistry.getRoutes();
      
      expect(routes.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Extension Types', () => {
  describe('ExtensionDefinition', () => {
    it('should require meta with id', () => {
      const definition: ExtensionDefinition = {
        meta: {
          id: 'valid-id',
          name: 'Valid',
          description: 'Valid extension',
          version: '1.0.0',
        },
      };

      expect(definition.meta.id).toBe('valid-id');
      expect(definition.meta.name).toBe('Valid');
    });

    it('should support optional setup/teardown', () => {
      const definition: ExtensionDefinition = {
        meta: {
          id: 'lifecycle-ext',
          name: 'Lifecycle',
          description: 'Lifecycle test',
          version: '1.0.0',
        },
        setup: async () => {},
        teardown: async () => {},
      };

      expect(typeof definition.setup).toBe('function');
      expect(typeof definition.teardown).toBe('function');
    });
  });
});
