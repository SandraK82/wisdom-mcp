import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signTransform, signFragment } from '../crypto/signing.js';
import type { CreateTransformRequest, CreateFragmentRequest } from '../gateway/types.js';

export function createTransformTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_transform_to_fragment',
        description:
          'Transform input content into English knowledge fragments (delegates to host for LLM-based transformation)',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to transform into fragments',
            },
            source_language: {
              type: 'string',
              description: 'Source language of the content (optional, auto-detected)',
            },
            domain: {
              type: 'string',
              description: 'Domain for transform selection (e.g., "software", "science")',
            },
            transform_uuid: {
              type: 'string',
              description: 'Specific transform UUID to use (optional)',
            },
          },
          required: ['content'],
        },
      },
      handler: async (args, context) => {
        const domain = (args.domain as string) || 'general';
        let transformSpec = '';

        // Try to load transform if specified or find by domain
        if (args.transform_uuid) {
          try {
            const transform = await context.gateway.getTransform(args.transform_uuid as string);
            transformSpec = transform.spec;
          } catch {
            // Transform not found, use default
          }
        } else if (domain !== 'general') {
          try {
            const transforms = await context.gateway.listTransforms(domain, 1, 0);
            if (transforms.data.length > 0) {
              transformSpec = transforms.data[0].spec;
            }
          } catch {
            // No transforms found for domain
          }
        }

        // Return delegation request for the host
        return {
          action: 'transform_request',
          direction: 'encode',
          input: args.content,
          source_language: args.source_language || 'auto',
          target_language: 'en',
          domain,
          transform_spec: transformSpec || null,
          instructions: `Please transform the following content into one or more English knowledge fragments. Each fragment should be:
1. Self-contained and atomic (one concept per fragment)
2. Written in clear, precise English
3. Factual and verifiable where possible

${transformSpec ? `Follow this transform specification:\n${transformSpec}\n\n` : ''}

Content to transform:
${args.content}

Return your result as JSON:
{
  "fragments": [
    {
      "content": "The transformed knowledge statement in English",
      "type": "FACT" | "QUESTION" | "ANSWER" | "DEFINITION" | "INSIGHT" | etc.
    }
  ],
  "source_language_detected": "detected language code"
}

After receiving this response, the fragments will be signed and stored.`,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_transform_from_fragment',
        description:
          'Transform English fragments back to a target language (delegates to host for LLM-based transformation)',
        inputSchema: {
          type: 'object',
          properties: {
            fragment_uuid: {
              type: 'string',
              description: 'Fragment UUID to transform',
            },
            target_language: {
              type: 'string',
              description: 'Target language for output (e.g., "de", "German")',
            },
            transform_uuid: {
              type: 'string',
              description: 'Specific transform UUID to use (optional)',
            },
          },
          required: ['fragment_uuid', 'target_language'],
        },
      },
      handler: async (args, context) => {
        // Fetch the fragment
        const fragment = await context.gateway.getFragment(args.fragment_uuid as string);
        let transformSpec = '';

        // Try to load transform if specified
        if (args.transform_uuid) {
          try {
            const transform = await context.gateway.getTransform(args.transform_uuid as string);
            transformSpec = transform.spec;
          } catch {
            // Transform not found
          }
        } else if (fragment.source_transform) {
          try {
            const transform = await context.gateway.getTransform(fragment.source_transform);
            transformSpec = transform.spec;
          } catch {
            // Original transform not found
          }
        }

        // Return delegation request for the host
        return {
          action: 'transform_request',
          direction: 'decode',
          input: fragment.content,
          source_language: fragment.language,
          target_language: args.target_language,
          fragment_uuid: fragment.uuid,
          transform_spec: transformSpec || null,
          instructions: `Please translate/transform the following English knowledge fragment into ${args.target_language}:

Fragment content:
${fragment.content}

${transformSpec ? `Follow this transform specification for decoding:\n${transformSpec}\n\n` : ''}

Maintain the semantic meaning while adapting to natural ${args.target_language} expression.

Return your result as JSON:
{
  "content": "The transformed content in ${args.target_language}",
  "notes": "Any relevant notes about the transformation"
}`,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_store_transformed_fragments',
        description: 'Store fragments that were transformed by the host',
        inputSchema: {
          type: 'object',
          properties: {
            fragments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string' },
                  type: { type: 'string' },
                },
              },
              description: 'Array of fragment objects with content and optional type',
            },
            source_transform: {
              type: 'string',
              description: 'Transform UUID that was used',
            },
            project: {
              type: 'string',
              description: 'Project UUID (uses current if not specified)',
            },
          },
          required: ['fragments'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const fragments = args.fragments as Array<{ content: string; type?: string }>;
        const project = (args.project as string) || context.config.config.current_project;
        const sourceTransform = args.source_transform as string | undefined;

        const results = [];

        for (const frag of fragments) {
          const uuid = uuidv4();
          const fragmentData: Omit<CreateFragmentRequest, 'signature'> = {
            uuid,
            content: frag.content,
            language: 'en',
            author: agentUuid,
            project: project || null,
            source_transform: sourceTransform || null,
          };

          const signature = await signFragment(fragmentData, privateKey);
          const created = await context.gateway.createFragment({
            ...fragmentData,
            signature,
          });

          results.push({
            uuid: created.uuid,
            content: created.content.substring(0, 100) + (created.content.length > 100 ? '...' : ''),
            type: frag.type,
          });
        }

        return {
          stored: results.length,
          fragments: results,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_transform',
        description: 'Get a transform specification by UUID',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Transform UUID',
            },
          },
          required: ['uuid'],
        },
      },
      handler: async (args, context) => {
        const transform = await context.gateway.getTransform(args.uuid as string);
        return transform;
      },
    },

    {
      tool: {
        name: 'wisdom_list_transforms',
        description: 'List available transforms',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Filter by domain (e.g., "software", "science")',
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
        const result = await context.gateway.listTransforms(
          args.domain as string | undefined,
          (args.limit as number) || 20,
          0
        );

        return {
          transforms: result.data.map((t) => ({
            uuid: t.uuid,
            name: t.name,
            description: t.description,
            domain: t.domain,
            version: t.version,
          })),
          total: result.total,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_create_transform',
        description: 'Create a new transform specification',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Transform name',
            },
            description: {
              type: 'string',
              description: 'Transform description',
            },
            domain: {
              type: 'string',
              description: 'Domain (e.g., "software", "science", "general")',
            },
            spec: {
              type: 'string',
              description: 'Transform specification (Markdown)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tag UUIDs',
            },
          },
          required: ['name', 'description', 'domain', 'spec'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const transformData: Omit<CreateTransformRequest, 'signature'> = {
          uuid,
          name: args.name as string,
          description: args.description as string,
          domain: args.domain as string,
          spec: args.spec as string,
          tags: (args.tags as string[]) || [],
          author: agentUuid,
        };

        const signature = await signTransform(transformData, privateKey);
        const transform = await context.gateway.createTransform({
          ...transformData,
          signature,
        });

        return {
          uuid: transform.uuid,
          name: transform.name,
          description: transform.description,
          domain: transform.domain,
          created_at: transform.created_at,
        };
      },
    },
  ];
}
