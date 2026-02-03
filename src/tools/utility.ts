import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { generateKeyPair } from '../crypto/keys.js';
import { signAgent } from '../crypto/signing.js';
import {
  saveProjectConfig,
  saveGlobalConfig,
  getPreferredConfigPath,
} from '../config/loader.js';

export function createUtilityTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_whoami',
        description:
          'Call this at the start of each session to verify agent identity and gateway connectivity. Shows current agent identity, project context, and gateway configuration.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      handler: async (_args, context) => {
        const { config, paths } = context.config;
        const isReachable = await context.gateway.isReachable();

        const result: Record<string, unknown> = {
          status: config.private_key ? 'configured' : 'unconfigured',
          agent_uuid: config.agent_uuid || null,
          has_private_key: !!config.private_key,
          gateway_url: config.gateway_url,
          gateway_reachable: isReachable,
          current_project: config.current_project || null,
          default_tags: config.default_tags || [],
          default_transform: config.default_transform || null,
          config_paths: {
            project_root: paths.projectRoot,
            project_config: paths.projectConfig,
            global_config: paths.globalConfig,
          },
        };

        if (!config.private_key) {
          result.hint =
            'No private key configured. Run wisdom_generate_keypair to create one.';
        }

        return result;
      },
    },

    {
      tool: {
        name: 'wisdom_generate_keypair',
        description:
          'Generate a new Ed25519 keypair and optionally register as a new agent',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Description for the new agent',
            },
            save_to: {
              type: 'string',
              enum: ['project', 'global'],
              description:
                'Where to save the config: project (.wisdom/config.json) or global (~/.config/claude/wisdom.json)',
            },
            register: {
              type: 'boolean',
              description:
                'Whether to register the agent at the gateway (default: true)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const description = (args.description as string) || 'AI Agent';
        const saveTo = (args.save_to as 'project' | 'global') || 'project';
        const register = args.register !== false;

        // Generate keypair
        const keypair = await generateKeyPair();

        // Prepare result
        const result: Record<string, unknown> = {
          public_key: keypair.publicKeyBase64,
          private_key_preview: keypair.privateKeyBase64.substring(0, 8) + '...',
        };

        // Register agent at gateway if requested
        let agentUuid: string | undefined;
        if (register) {
          try {
            const uuid = uuidv4();
            const agentData = {
              uuid,
              public_key: keypair.publicKeyBase64,
              description,
              trust: { num_trusts: 0, trusts: [] },
              primary_hub: '',
            };

            const signature = await signAgent(agentData, keypair.privateKey);
            const agent = await context.gateway.createAgent({
              ...agentData,
              signature,
            });

            agentUuid = agent.uuid;
            result.agent_uuid = agent.uuid;
            result.registered = true;
          } catch (error) {
            result.registered = false;
            result.registration_error =
              error instanceof Error ? error.message : String(error);
          }
        }

        // Save config
        const configUpdate = {
          private_key: keypair.privateKeyBase64,
          agent_uuid: agentUuid,
        };

        try {
          if (saveTo === 'project' && context.config.paths.projectConfig) {
            saveProjectConfig(configUpdate, context.config.paths.projectRoot || undefined);
            result.saved_to = context.config.paths.projectConfig;
          } else {
            saveGlobalConfig(configUpdate);
            result.saved_to = context.config.paths.globalConfig;
          }
          result.saved = true;

          // Update in-memory config
          context.updateConfig(configUpdate);
        } catch (error) {
          result.saved = false;
          result.save_error =
            error instanceof Error ? error.message : String(error);
        }

        return result;
      },
    },

    {
      tool: {
        name: 'wisdom_configure',
        description: 'Update wisdom-mcp configuration',
        inputSchema: {
          type: 'object',
          properties: {
            gateway_url: {
              type: 'string',
              description: 'Gateway URL (e.g., http://localhost:8080)',
            },
            current_project: {
              type: 'string',
              description: 'Set current project UUID',
            },
            default_tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Default tag UUIDs to apply to new fragments',
            },
            default_transform: {
              type: 'string',
              description: 'Default transform UUID',
            },
            save_to: {
              type: 'string',
              enum: ['project', 'global'],
              description: 'Where to save changes',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const updates: Record<string, unknown> = {};

        if (args.gateway_url) updates.gateway_url = args.gateway_url;
        if (args.current_project !== undefined)
          updates.current_project = args.current_project || undefined;
        if (args.default_tags) updates.default_tags = args.default_tags;
        if (args.default_transform !== undefined)
          updates.default_transform = args.default_transform || undefined;

        const saveTo = args.save_to as 'project' | 'global' | undefined;

        // Save to disk
        if (saveTo === 'project' && context.config.paths.projectConfig) {
          saveProjectConfig(updates, context.config.paths.projectRoot || undefined);
        } else if (saveTo === 'global') {
          saveGlobalConfig(updates);
        } else if (Object.keys(updates).length > 0) {
          // Use preferred location
          const preferredPath = getPreferredConfigPath(context.config.paths);
          if (preferredPath === context.config.paths.projectConfig) {
            saveProjectConfig(updates, context.config.paths.projectRoot || undefined);
          } else {
            saveGlobalConfig(updates);
          }
        }

        // Update in-memory config
        context.updateConfig(updates);

        return {
          updated: Object.keys(updates),
          current_config: {
            gateway_url: context.config.config.gateway_url,
            current_project: context.config.config.current_project,
            default_tags: context.config.config.default_tags,
            default_transform: context.config.config.default_transform,
          },
        };
      },
    },

    {
      tool: {
        name: 'wisdom_reload_config',
        description: 'Reload configuration from disk',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      handler: async (_args, context) => {
        context.reloadConfig();
        return {
          message: 'Configuration reloaded',
          gateway_url: context.config.config.gateway_url,
          agent_uuid: context.config.config.agent_uuid,
          current_project: context.config.config.current_project,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_quickstart',
        description:
          'One-step setup: checks agent, registers if needed, verifies project, and loads context for current task. Call this instead of multiple separate setup calls.',
        inputSchema: {
          type: 'object',
          properties: {
            task_description: {
              type: 'string',
              description: 'Description of the current task to load relevant context for',
            },
            agent_description: {
              type: 'string',
              description: 'Description for the agent if auto-registration is needed',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const steps: string[] = [];
        const result: Record<string, unknown> = {};

        // Step 1: Check agent
        const { config } = context.config;
        if (!config.private_key || !config.agent_uuid) {
          // Auto-register
          steps.push('Agent not configured — auto-registering...');
          const keypair = await generateKeyPair();
          const uuid = uuidv4();
          const description = (args.agent_description as string) || 'AI Agent (auto-registered)';
          const agentData = {
            uuid,
            public_key: keypair.publicKeyBase64,
            description,
            trust: { num_trusts: 0, trusts: [] },
            primary_hub: '',
          };

          try {
            const signature = await signAgent(agentData, keypair.privateKey);
            const agent = await context.gateway.createAgent({ ...agentData, signature });

            const configUpdate = {
              private_key: keypair.privateKeyBase64,
              agent_uuid: agent.uuid,
            };

            const preferredPath = getPreferredConfigPath(context.config.paths);
            if (preferredPath === context.config.paths.projectConfig) {
              saveProjectConfig(configUpdate, context.config.paths.projectRoot || undefined);
            } else {
              saveGlobalConfig(configUpdate);
            }
            context.updateConfig(configUpdate);

            result.agent_uuid = agent.uuid;
            result.auto_registered = true;
            steps.push(`Agent registered: ${agent.uuid}`);
          } catch (error) {
            steps.push(`Auto-registration failed: ${error instanceof Error ? error.message : String(error)}`);
            result.auto_registered = false;
          }
        } else {
          result.agent_uuid = config.agent_uuid;
          result.auto_registered = false;
          steps.push(`Agent already configured: ${config.agent_uuid}`);
        }

        // Step 2: Check gateway
        const isReachable = await context.gateway.isReachable();
        result.gateway_reachable = isReachable;
        steps.push(isReachable ? 'Gateway reachable' : 'WARNING: Gateway not reachable');

        // Step 3: Check project
        result.current_project = context.config.config.current_project || null;
        if (result.current_project) {
          steps.push(`Project set: ${result.current_project}`);
        } else {
          steps.push('No project set (use wisdom_create_project or wisdom_set_project)');
        }

        // Step 4: Load context if task description provided
        if (args.task_description && isReachable) {
          try {
            const searchResult = await context.gateway.searchFragments({
              query: args.task_description as string,
              project: context.config.config.current_project || undefined,
              limit: 10,
            });
            const items = searchResult.items || [];
            result.relevant_fragments = items.length;
            if (items.length > 0) {
              result.context = items.map((f) => ({
                uuid: f.uuid,
                content: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : ''),
                trust_score: f.trust_summary?.score ?? 0,
              }));
              steps.push(`Loaded ${items.length} relevant fragments`);
            } else {
              steps.push('No prior knowledge found for this task');
            }
          } catch {
            steps.push('Could not load context (search failed)');
          }
        }

        result.steps = steps;
        return result;
      },
    },
  ];
}
