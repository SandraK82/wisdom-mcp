import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import type { CreateProjectRequest } from '../gateway/types.js';

export function createProjectTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_set_project',
        description: 'Set the current project context',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project UUID to set as current',
            },
            persist: {
              type: 'boolean',
              description: 'Whether to persist the change to config file (default: true)',
            },
          },
          required: ['project'],
        },
      },
      handler: async (args, context) => {
        const projectUuid = args.project as string;
        const persist = args.persist !== false;

        // Verify project exists
        const project = await context.gateway.getProject(projectUuid);

        // Update config
        context.updateConfig({ current_project: projectUuid }, persist);

        return {
          message: `Current project set to: ${project.name}`,
          project: {
            uuid: project.uuid,
            name: project.name,
            description: project.description,
          },
          persisted: persist,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_project',
        description: 'Get current project or a specific project by UUID',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Project UUID (uses current project if not specified)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const uuid = (args.uuid as string) || context.config.config.current_project;

        if (!uuid) {
          return {
            current_project: null,
            message: 'No current project set. Use wisdom_set_project or wisdom_create_project.',
          };
        }

        const project = await context.gateway.getProject(uuid);
        return {
          ...project,
          is_current: uuid === context.config.config.current_project,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_create_project',
        description: 'Create a new project',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Project name',
            },
            description: {
              type: 'string',
              description: 'Project description',
            },
            default_tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Default tag UUIDs for fragments in this project',
            },
            default_transform: {
              type: 'string',
              description: 'Default transform UUID for this project',
            },
            set_as_current: {
              type: 'boolean',
              description: 'Set this project as current after creation (default: true)',
            },
          },
          required: ['name'],
        },
      },
      handler: async (args, context) => {
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const projectData: CreateProjectRequest = {
          uuid,
          name: args.name as string,
          description: (args.description as string) || '',
          owner: agentUuid,
          default_tags: (args.default_tags as string[]) || [],
          default_transform: (args.default_transform as string) || null,
        };

        const project = await context.gateway.createProject(projectData);

        // Set as current if requested (default: true)
        const setAsCurrent = args.set_as_current !== false;
        if (setAsCurrent) {
          context.updateConfig({ current_project: project.uuid }, true);
        }

        return {
          uuid: project.uuid,
          name: project.name,
          description: project.description,
          owner: project.owner,
          created_at: project.created_at,
          is_current: setAsCurrent,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_list_projects',
        description: "List the current agent's projects",
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum results (default: 20)',
            },
            offset: {
              type: 'number',
              description: 'Offset for pagination',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const result = await context.gateway.listProjects(
          agentUuid,
          (args.limit as number) || 20,
          (args.offset as number) || 0
        );

        const currentProject = context.config.config.current_project;

        return {
          projects: result.data.map((p) => ({
            uuid: p.uuid,
            name: p.name,
            description: p.description,
            is_current: p.uuid === currentProject,
            created_at: p.created_at,
          })),
          total: result.total,
          current_project: currentProject,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_update_project',
        description: 'Update project settings',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Project UUID (uses current project if not specified)',
            },
            name: {
              type: 'string',
              description: 'New project name',
            },
            description: {
              type: 'string',
              description: 'New project description',
            },
            default_tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'New default tags',
            },
            default_transform: {
              type: 'string',
              description: 'New default transform',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const uuid = (args.uuid as string) || context.config.config.current_project;

        if (!uuid) {
          throw new Error('No project specified and no current project set.');
        }

        const updates: Partial<CreateProjectRequest> = {};
        if (args.name) updates.name = args.name as string;
        if (args.description !== undefined) updates.description = args.description as string;
        if (args.default_tags) updates.default_tags = args.default_tags as string[];
        if (args.default_transform !== undefined)
          updates.default_transform = args.default_transform as string | null;

        const project = await context.gateway.updateProject(uuid, updates);

        return {
          uuid: project.uuid,
          name: project.name,
          description: project.description,
          default_tags: project.default_tags,
          default_transform: project.default_transform,
          updated_at: project.updated_at,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_clear_project',
        description: 'Clear the current project context',
        inputSchema: {
          type: 'object',
          properties: {
            persist: {
              type: 'boolean',
              description: 'Whether to persist the change (default: true)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const persist = args.persist !== false;

        context.updateConfig({ current_project: undefined }, persist);

        return {
          message: 'Current project cleared',
          persisted: persist,
        };
      },
    },
  ];
}
