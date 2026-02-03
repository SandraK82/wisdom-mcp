import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signFragment } from '../crypto/signing.js';
import type { CreateFragmentRequest, SearchFragmentsRequest } from '../gateway/types.js';
import { createLocalAddress, createHubAddress, addressToString } from '../gateway/types.js';

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
        const hubHost = context.config.config.hub_host;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const sourceTransform = args.source_transform as string | undefined;
        const projectUUID = (args.project as string) || context.config.config.current_project;

        // Creator is always hub-based (agent lives on hub)
        const creatorAddr = hubHost
          ? createHubAddress(hubHost, 'AGENT', agentUuid)
          : createLocalAddress('AGENT', agentUuid);

        const fragmentData: Omit<CreateFragmentRequest, 'signature'> = {
          uuid,
          content: args.content as string,
          creator: creatorAddr,
          when: new Date().toISOString(),
          tags: [],
          transform: sourceTransform ? createLocalAddress('TRANSFORMATION', sourceTransform) : undefined,
          confidence: 0.8,
          evidence_type: 'unknown',
        };

        const signature = await signFragment(fragmentData, privateKey);
        const fragment = await context.gateway.createFragment({
          ...fragmentData,
          signature,
        }, projectUUID);

        return {
          uuid: fragment.uuid,
          content: fragment.content,
          creator: addressToString(fragment.creator),
          when: fragment.when,
          state: fragment.state,
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
        };

        const result = await context.gateway.searchFragments(params);
        const items = result.items || [];
        return {
          fragments: items.map((f) => ({
            uuid: f.uuid,
            content: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : ''),
            creator: addressToString(f.creator),
            state: f.state,
            trust_score: f.trust_summary?.score ?? 0,
          })),
          count: items.length,
          next_cursor: result.next_cursor,
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
            cursor: {
              type: 'string',
              description: 'Cursor for pagination',
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
        const cursor = args.cursor as string | undefined;
        const project = (args.project as string) || context.config.config.current_project;

        let result;
        if (project) {
          result = await context.gateway.searchFragments({ project, limit });
        } else {
          result = await context.gateway.listFragments(limit, cursor);
        }

        const items = result.items || [];
        return {
          fragments: items.map((f) => ({
            uuid: f.uuid,
            content: f.content.substring(0, 100) + (f.content.length > 100 ? '...' : ''),
            creator: addressToString(f.creator),
            state: f.state,
            created_at: f.created_at,
          })),
          count: items.length,
          next_cursor: result.next_cursor,
        };
      },
    },
  ];
}
