import { z } from 'zod';

/**
 * Configuration schema for wisdom-mcp
 */
export const WisdomConfigSchema = z.object({
  // Agent identity
  agent_uuid: z.string().uuid().optional(),
  private_key: z.string().optional(), // Base64 Ed25519 private key

  // Gateway connection
  gateway_url: z.string().url().default('http://localhost:8080'),

  // Hub connection (for address construction)
  hub_host: z.string().optional(), // e.g., "hub1.wisdom.spawning.de:443"

  // Current context (persistent state)
  current_project: z.string().uuid().optional(),
  default_tags: z.array(z.string().uuid()).optional(),
  default_transform: z.string().uuid().optional(),
});

export type WisdomConfig = z.infer<typeof WisdomConfigSchema>;

/**
 * Partial config for merging from different sources
 */
export const PartialWisdomConfigSchema = WisdomConfigSchema.partial();
export type PartialWisdomConfig = z.infer<typeof PartialWisdomConfigSchema>;

/**
 * Server mode configuration
 */
export type ServerMode = 'stdio' | 'http';

export interface ServerConfig {
  mode: ServerMode;
  httpPort?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: WisdomConfig = {
  gateway_url: 'http://localhost:8080',
};

/**
 * Configuration file names
 */
export const CONFIG_FILES = {
  project: '.wisdom/config.json',
  global: 'wisdom.json',
} as const;
