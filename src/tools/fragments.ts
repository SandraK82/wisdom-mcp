import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signFragment } from '../crypto/signing.js';
import type { CreateFragmentRequest, SearchFragmentsRequest } from '../gateway/types.js';

export function createFragmentTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_create_fragment',
        description: 'Create and sign a new knowledge fragment',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The content of the fragment (English recommended for interoperability)',
            },
            language: {
              type: 'string',
              description: 'Language code (default: en)',
            },
            project: {
              type: 'string',
              description: 'Project UUID (uses current project if not specified)',
            },
            source_transform: {
              type: 'string',
              description: 'Transform UUID if created via transformation',
            },
          },
          required: ['content'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const fragmentData: Omit<CreateFragmentRequest, 'signature'> = {
          uuid,
          content: args.content as string,
          language: (args.language as string) || 'en',
          author: agentUuid,
          project: (args.project as string) || context.config.config.current_project || null,
          source_transform: (args.source_transform as string) || null,
        };

        const signature = await signFragment(fragmentData, privateKey);
        const fragment = await context.gateway.createFragment({
          ...fragmentData,
          signature,
        });

        return {
          uuid: fragment.uuid,
          content: fragment.content,
          language: fragment.language,
          author: fragment.author,
          project: fragment.project,
          state: fragment.state,
          created_at: fragment.created_at,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_fragment',
        description: 'Retrieve a fragment by UUID',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Fragment UUID',
            },
          },
          required: ['uuid'],
        },
      },
      handler: async (args, context) => {
        const fragment = await context.gateway.getFragment(args.uuid as string);
        return fragment;
      },
    },

    {
      tool: {
        name: 'wisdom_search_fragments',
        description: 'Search fragments with text query and filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Text search query',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tag UUIDs',
            },
            author: {
              type: 'string',
              description: 'Filter by author agent UUID',
            },
            project: {
              type: 'string',
              description: 'Filter by project UUID',
            },
            state: {
              type: 'string',
              enum: ['proposed', 'verified', 'contested'],
              description: 'Filter by fragment state',
            },
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
        const params: SearchFragmentsRequest = {
          query: args.query as string | undefined,
          tags: args.tags as string[] | undefined,
          author: args.author as string | undefined,
          project: (args.project as string) || context.config.config.current_project,
          state: args.state as SearchFragmentsRequest['state'],
          limit: (args.limit as number) || 20,
          offset: (args.offset as number) || 0,
        };

        const result = await context.gateway.searchFragments(params);
        return {
          fragments: result.data.map((f) => ({
            uuid: f.uuid,
            content: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : ''),
            language: f.language,
            author: f.author,
            state: f.state,
            trust_score: f.trust_summary.score,
          })),
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_list_fragments',
        description: 'List recent fragments',
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
            project: {
              type: 'string',
              description: 'Filter by project UUID (uses current project if set)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const limit = (args.limit as number) || 20;
        const offset = (args.offset as number) || 0;
        const project = (args.project as string) || context.config.config.current_project;

        let result;
        if (project) {
          result = await context.gateway.searchFragments({ project, limit, offset });
        } else {
          result = await context.gateway.listFragments(limit, offset);
        }

        return {
          fragments: result.data.map((f) => ({
            uuid: f.uuid,
            content: f.content.substring(0, 100) + (f.content.length > 100 ? '...' : ''),
            language: f.language,
            state: f.state,
            created_at: f.created_at,
          })),
          total: result.total,
        };
      },
    },
  ];
}
