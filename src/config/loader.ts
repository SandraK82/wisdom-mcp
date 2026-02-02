import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  WisdomConfig,
  PartialWisdomConfig,
  PartialWisdomConfigSchema,
  DEFAULT_CONFIG,
  CONFIG_FILES,
} from './schema.js';

/**
 * Find project root by looking for .wisdom directory or .git
 */
function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.wisdom'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Get the global config directory
 */
function getGlobalConfigDir(): string {
  // Follow XDG Base Directory spec on Linux, use standard paths on other platforms
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'claude');
  }
  return path.join(os.homedir(), '.config', 'claude');
}

/**
 * Load config from a JSON file
 */
function loadConfigFile(filePath: string): PartialWisdomConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const result = PartialWisdomConfigSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.error(`Invalid config at ${filePath}:`, result.error.message);
    return null;
  } catch (error) {
    console.error(`Error loading config from ${filePath}:`, error);
    return null;
  }
}

/**
 * Load config from environment variables
 */
function loadEnvConfig(): PartialWisdomConfig {
  const config: PartialWisdomConfig = {};

  if (process.env.WISDOM_PRIVATE_KEY) {
    config.private_key = process.env.WISDOM_PRIVATE_KEY;
  }

  if (process.env.WISDOM_GATEWAY_URL) {
    config.gateway_url = process.env.WISDOM_GATEWAY_URL;
  }

  if (process.env.WISDOM_AGENT_UUID) {
    config.agent_uuid = process.env.WISDOM_AGENT_UUID;
  }

  if (process.env.WISDOM_PROJECT_UUID) {
    config.current_project = process.env.WISDOM_PROJECT_UUID;
  }

  return config;
}

/**
 * Deep merge configs, later values override earlier ones
 */
function mergeConfigs(...configs: (PartialWisdomConfig | null)[]): WisdomConfig {
  const merged: PartialWisdomConfig = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    if (config) {
      Object.assign(merged, config);
      // Handle arrays specially - replace rather than merge
      if (config.default_tags !== undefined) {
        merged.default_tags = config.default_tags;
      }
    }
  }

  return merged as WisdomConfig;
}

/**
 * Configuration paths found during loading
 */
export interface ConfigPaths {
  projectRoot: string | null;
  projectConfig: string | null;
  globalConfig: string;
}

/**
 * Configuration loader result
 */
export interface LoadedConfig {
  config: WisdomConfig;
  paths: ConfigPaths;
}

/**
 * Load configuration following hierarchy:
 * 1. Project-level: .wisdom/config.json (highest priority)
 * 2. Environment variables
 * 3. Global: ~/.config/claude/wisdom.json (lowest priority)
 */
export function loadConfig(startDir?: string): LoadedConfig {
  const projectRoot = findProjectRoot(startDir);
  const globalConfigDir = getGlobalConfigDir();

  const paths: ConfigPaths = {
    projectRoot,
    projectConfig: projectRoot
      ? path.join(projectRoot, CONFIG_FILES.project)
      : null,
    globalConfig: path.join(globalConfigDir, CONFIG_FILES.global),
  };

  // Load configs in priority order (lowest to highest)
  const globalConfig = loadConfigFile(paths.globalConfig);
  const envConfig = loadEnvConfig();
  const projectConfig = paths.projectConfig
    ? loadConfigFile(paths.projectConfig)
    : null;

  // Merge with highest priority last
  const config = mergeConfigs(globalConfig, envConfig, projectConfig);

  return { config, paths };
}

/**
 * Save config to a file
 */
export function saveConfig(
  config: PartialWisdomConfig,
  filePath: string
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing config and merge
  const existing = loadConfigFile(filePath) || {};
  const merged = { ...existing, ...config };

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
}

/**
 * Save config to project-level .wisdom/config.json
 */
export function saveProjectConfig(
  config: PartialWisdomConfig,
  projectRoot?: string
): void {
  const root = projectRoot || findProjectRoot() || process.cwd();
  const configPath = path.join(root, CONFIG_FILES.project);
  saveConfig(config, configPath);
}

/**
 * Save config to global ~/.config/claude/wisdom.json
 */
export function saveGlobalConfig(config: PartialWisdomConfig): void {
  const configPath = path.join(getGlobalConfigDir(), CONFIG_FILES.global);
  saveConfig(config, configPath);
}

/**
 * Check if a private key is configured
 */
export function hasPrivateKey(config: WisdomConfig): boolean {
  return !!config.private_key;
}

/**
 * Check if an agent is configured
 */
export function hasAgent(config: WisdomConfig): boolean {
  return !!config.agent_uuid && !!config.private_key;
}

/**
 * Get the config path where a new config should be saved
 * Prefers project-level if in a project, otherwise global
 */
export function getPreferredConfigPath(paths: ConfigPaths): string {
  if (paths.projectConfig) {
    return paths.projectConfig;
  }
  return paths.globalConfig;
}
