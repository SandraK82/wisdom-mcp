import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signTag, signRelation } from '../crypto/signing.js';
import type { CreateTagRequest, CreateRelationRequest, TagCategory } from '../gateway/types.js';

export function createTagTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_create_tag',
        description: 'Create a new tag for categorizing fragments',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Tag name (should be unique within category)',
            },
            category: {
              type: 'string',
              enum: [
                'PLATFORM',
                'LANGUAGE',
                'FRAMEWORK',
                'LIBRARY',
                'VERSION',
                'DOMAIN',
                'TYPE',
                'ENVIRONMENT',
                'ARCHITECTURE',
                'COUNTRY',
                'FIELD',
              ],
              description: 'Tag category',
            },
            description: {
              type: 'string',
              description: 'Description of what this tag represents',
            },
          },
          required: ['name', 'category'],
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
        const creatorAddr = context.addressCache.get(agentUuid, 'AGENT', hubHost);
        const tagData: Omit<CreateTagRequest, 'signature'> = {
          uuid,
          name: args.name as string,
          category: args.category as TagCategory,
          content: (args.description as string) || '',
          creator: creatorAddr,
        };

        const signature = await signTag(tagData, privateKey);
        const tag = await context.gateway.createTag({
          ...tagData,
          signature,
        });

        return {
          uuid: tag.uuid,
          name: tag.name,
          category: tag.category,
          content: tag.content,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_tag',
        description: 'Get a tag by UUID or name',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Tag UUID',
            },
            name: {
              type: 'string',
              description: 'Tag name (alternative to UUID)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        if (args.uuid) {
          const tag = await context.gateway.getTag(args.uuid as string);
          return tag;
        }

        if (args.name) {
          const tag = await context.gateway.getTagByName(args.name as string);
          if (!tag) {
            throw new Error(`Tag not found: ${args.name}`);
          }
          return tag;
        }

        throw new Error('Either uuid or name must be provided');
      },
    },

    {
      tool: {
        name: 'wisdom_list_tags',
        description: 'List tags, optionally filtered by category',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              description: 'Filter by category',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (default: 100)',
            },
            cursor: {
              type: 'string',
              description: 'Cursor for pagination',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const result = await context.gateway.listTags(
          args.category as string | undefined,
          (args.limit as number) || 100,
          args.cursor as string | undefined
        );

        const items = result.items || [];
        return {
          tags: items.map((t) => ({
            uuid: t.uuid,
            name: t.name,
            category: t.category,
            content: t.content,
          })),
          count: items.length,
          next_cursor: result.next_cursor,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_tag_fragment',
        description: 'Apply a tag to a fragment via relation',
        inputSchema: {
          type: 'object',
          properties: {
            fragment: {
              type: 'string',
              description: 'Fragment UUID',
            },
            tag: {
              type: 'string',
              description: 'Tag UUID or name',
            },
          },
          required: ['fragment', 'tag'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;
        const hubHost = context.config.config.hub_host;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        // Resolve tag if name is provided
        let tagUuid = args.tag as string;
        if (!tagUuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          const tag = await context.gateway.getTagByName(tagUuid);
          if (!tag) {
            throw new Error(`Tag not found: ${tagUuid}`);
          }
          tagUuid = tag.uuid;
        }

        const uuid = uuidv4();
        const creatorAddr = context.addressCache.get(agentUuid, 'AGENT', hubHost);
        const fragmentAddr = context.addressCache.get(args.fragment as string, 'FRAGMENT', hubHost);
        const tagAddr = context.addressCache.get(tagUuid, 'TAG', hubHost);
        const now = new Date().toISOString();

        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          from: fragmentAddr,
          to: tagAddr,
          by: creatorAddr,
          type: 'RELATED_TO',
          content: 'Fragment tagged',
          creator: creatorAddr,
          when: now,
        };

        const signature = await signRelation(relationData, privateKey);
        const projectUUID = context.config.config.current_project;
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        }, projectUUID);

        return {
          uuid: relation.uuid,
          fragment: args.fragment,
          tag: tagUuid,
          message: 'Tag applied to fragment',
        };
      },
    },

    {
      tool: {
        name: 'wisdom_suggest_tags',
        description:
          'Request tag suggestions for content (delegates to host for LLM-based analysis)',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to analyze for tag suggestions',
            },
            max_suggestions: {
              type: 'number',
              description: 'Maximum number of suggestions (default: 5)',
            },
          },
          required: ['content'],
        },
      },
      handler: async (args, context) => {
        // Get existing tags for reference
        const existingTags = await context.gateway.listTags(undefined, 100);
        const maxSuggestions = (args.max_suggestions as number) || 5;
        const tagsData = existingTags.items || [];

        // This tool returns a request for the host to perform tag analysis
        // The host (Claude) should use the existing tags and content to suggest appropriate tags
        return {
          action: 'tag_suggestion_request',
          content: args.content,
          existing_tags: tagsData.map((t) => ({
            uuid: t.uuid,
            name: t.name,
            category: t.category,
            content: t.content,
          })),
          max_suggestions: maxSuggestions,
          instructions: `Please analyze the content and suggest up to ${maxSuggestions} relevant tags from the existing tags list. If no suitable tags exist, suggest new tags to create. Return your suggestions in the format:

{
  "existing_tags": ["uuid1", "uuid2"], // UUIDs of existing tags that match
  "new_tags": [
    {"name": "tag-name", "category": "DOMAIN", "description": "..."}
  ]
}`,
        };
      },
    },
  ];
}
