import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, LoadedConfig } from './config/index.js';
import { GatewayClient } from './gateway/client.js';
import { KeyManager } from './crypto/keys.js';
import type { Address, AddressDomain } from './gateway/types.js';
import { createLocalAddress, createHubAddress } from './gateway/types.js';

// Tool imports
import { createFragmentTools } from './tools/fragments.js';
import { createRelationTools } from './tools/relations.js';
import { createTagTools } from './tools/tags.js';
import { createTransformTools } from './tools/transforms.js';
import { createProjectTools } from './tools/projects.js';
import { createAgentTools } from './tools/agents.js';
import { createUtilityTools } from './tools/utility.js';
import { createValidityTools } from './tools/validity.js';

/**
 * LRU address cache for entities seen during this session.
 * Caches gateway-returned addresses so relations use correct hub addresses.
 * Evicts least-recently-used entries when capacity is reached.
 */
export class AddressCache {
  private cache = new Map<string, Address>();
  private maxSize: number;

  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
  }

  /** Cache an address by entity UUID */
  put(uuid: string, addr: Address): void {
    // Delete first to refresh insertion order (Map preserves insertion order)
    if (this.cache.has(uuid)) {
      this.cache.delete(uuid);
    }
    this.cache.set(uuid, addr);
    // Evict oldest entries if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  /** Get cached address, or build one using hubHost fallback */
  get(uuid: string, domain: AddressDomain, hubHost?: string): Address {
    const cached = this.cache.get(uuid);
    if (cached) {
      // Move to end (most recently used)
      this.cache.delete(uuid);
      this.cache.set(uuid, cached);
      return cached;
    }
    return hubHost
      ? createHubAddress(hubHost, domain, uuid)
      : createLocalAddress(domain, uuid);
  }

  /** Check if a UUID is cached */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /** Number of cached entries */
  get size(): number {
    return this.cache.size;
  }

  /** Clear the cache */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Server context shared across tools
 */
export interface ServerContext {
  config: LoadedConfig;
  gateway: GatewayClient;
  keyManager: KeyManager;
  addressCache: AddressCache;

  // Reload config from disk
  reloadConfig(): void;

  // Update config (in memory and optionally persist)
  updateConfig(updates: Partial<LoadedConfig['config']>, persist?: boolean): void;
}

/**
 * Tool handler type
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ServerContext
) => Promise<unknown>;

/**
 * Tool definition with handler
 */
export interface ToolDefinition {
  tool: Tool;
  handler: ToolHandler;
}

/**
 * Create and configure the MCP server
 */
export async function createServer(): Promise<Server> {
  // Load configuration
  let loadedConfig = loadConfig();

  // Initialize components
  const gateway = new GatewayClient(loadedConfig.config.gateway_url);
  const keyManager = new KeyManager(loadedConfig.config);

  // Create server context
  const addressCache = new AddressCache();
  const context: ServerContext = {
    config: loadedConfig,
    gateway,
    keyManager,
    addressCache,

    reloadConfig() {
      loadedConfig = loadConfig();
      this.config = loadedConfig;
      gateway.setBaseUrl(loadedConfig.config.gateway_url);
      keyManager.setConfig(loadedConfig.config);
    },

    updateConfig(updates, persist = false) {
      Object.assign(this.config.config, updates);
      gateway.setBaseUrl(this.config.config.gateway_url);
      keyManager.setConfig(this.config.config);

      if (persist) {
        // Import dynamically to avoid circular deps
        import('./config/loader.js').then(({ saveProjectConfig, saveGlobalConfig }) => {
          if (this.config.paths.projectConfig) {
            saveProjectConfig(updates);
          } else {
            saveGlobalConfig(updates);
          }
        });
      }
    },
  };

  // Create server
  const server = new Server(
    {
      name: 'wisdom-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Collect all tool definitions
  const toolDefinitions: ToolDefinition[] = [
    ...createUtilityTools(),
    ...createFragmentTools(),
    ...createRelationTools(),
    ...createTagTools(),
    ...createTransformTools(),
    ...createProjectTools(),
    ...createAgentTools(),
    ...createValidityTools(),
  ];

  // Build tool lookup map
  const toolMap = new Map<string, ToolDefinition>();
  for (const def of toolDefinitions) {
    toolMap.set(def.tool.name, def);
  }

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions.map((def) => def.tool),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const definition = toolMap.get(name);
    if (!definition) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await definition.handler(args || {}, context);

      // Check for hub status warnings and include them in the response
      const hubWarnings = context.gateway.getHubWarningMessages();
      const resultText = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);

      // Build response content
      const content: Array<{ type: 'text'; text: string }> = [
        {
          type: 'text',
          text: resultText,
        },
      ];

      // Add hub warnings as a separate text block if present
      if (hubWarnings.length > 0) {
        content.push({
          type: 'text',
          text: '\n---\n' + hubWarnings.join('\n'),
        });
      }

      return { content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check for hub status warnings even on error
      const hubWarnings = context.gateway.getHubWarningMessages();
      const errorContent: Array<{ type: 'text'; text: string }> = [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ];

      if (hubWarnings.length > 0) {
        errorContent.push({
          type: 'text',
          text: '\n---\n' + hubWarnings.join('\n'),
        });
      }

      return {
        content: errorContent,
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the server in stdio mode
 */
export async function startStdioServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
