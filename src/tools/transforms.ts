import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signTransform, signFragment } from '../crypto/signing.js';
import type { CreateTransformRequest, CreateFragmentRequest } from '../gateway/types.js';
import { PRESETS, selectPreset, getPresetTransform } from '../transform/presets.js';

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
            transformSpec = transform.additional_data || '';
          } catch {
            // Transform not found, use default
          }
        } else if (domain !== 'general') {
          try {
            const transforms = await context.gateway.listTransforms(domain, 1);
            const items = transforms.items || [];
            if (items.length > 0) {
              transformSpec = items[0].additional_data || '';
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
            transformSpec = transform.additional_data || '';
          } catch {
            // Transform not found
          }
        } else if (fragment.transform && fragment.transform.entity) {
          try {
            const transform = await context.gateway.getTransform(fragment.transform.entity);
            transformSpec = transform.additional_data || '';
          } catch {
            // Original transform not found
          }
        }

        // Return delegation request for the host
        return {
          action: 'transform_request',
          direction: 'decode',
          input: fragment.content,
          source_language: 'en', // Fragments are stored in English
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
        description: 'Store fragments that were transformed by the host. Optionally provide original_content to track compression metrics.',
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
            original_content: {
              type: 'string',
              description: 'The original content before transformation (for compression metrics)',
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
        const hubHost = context.config.config.hub_host;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const fragments = args.fragments as Array<{ content: string; type?: string }>;
        const sourceTransform = args.source_transform as string | undefined;
        const originalContent = args.original_content as string | undefined;
        const projectUUID = (args.project as string) || context.config.config.current_project;

        if (!sourceTransform) {
          throw new Error('source_transform is required. Every fragment must reference a transform.');
        }

        const creatorAddr = context.addressCache.get(agentUuid, 'AGENT', hubHost);
        const transformAddr = context.addressCache.get(sourceTransform, 'TRANSFORMATION', hubHost);

        // Rough token estimation (4 chars ≈ 1 token)
        const estimateTokens = (text: string) => Math.ceil(text.length / 4);

        const originalTokens = originalContent ? estimateTokens(originalContent) : undefined;
        const results = [];
        let totalEncodedTokens = 0;

        for (const frag of fragments) {
          const uuid = uuidv4();
          const fragmentData: Omit<CreateFragmentRequest, 'signature'> = {
            uuid,
            content: frag.content,
            creator: creatorAddr,
            when: new Date().toISOString(),
            tags: [],
            transform: transformAddr,
            confidence: 0.8,
            evidence_type: 'unknown',
          };

          const signature = await signFragment(fragmentData, privateKey);
          const created = await context.gateway.createFragment({
            ...fragmentData,
            signature,
          }, projectUUID);

          const encodedTokens = estimateTokens(frag.content);
          totalEncodedTokens += encodedTokens;

          results.push({
            uuid: created.uuid,
            content: created.content.substring(0, 100) + (created.content.length > 100 ? '...' : ''),
            type: frag.type,
            encoded_tokens: encodedTokens,
          });
        }

        const response: Record<string, unknown> = {
          stored: results.length,
          fragments: results,
        };

        // Add compression metrics if original content was provided
        if (originalTokens !== undefined && originalTokens > 0) {
          const compressionRatio = Math.round((1 - totalEncodedTokens / originalTokens) * 100);
          response.compression = {
            original_tokens: originalTokens,
            encoded_tokens: totalEncodedTokens,
            compression_ratio: `${compressionRatio}%`,
            savings: `${originalTokens - totalEncodedTokens} tokens saved`,
          };
        }

        return response;
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
          (args.limit as number) || 20
        );

        const items = result.items || [];
        return {
          transforms: items.map((t) => ({
            uuid: t.uuid,
            name: t.name,
            description: t.description,
            transform_to: t.transform_to,
            transform_from: t.transform_from,
            version: t.version,
          })),
          count: items.length,
          next_cursor: result.next_cursor,
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
            transform_to: {
              type: 'string',
              description: 'Target format (e.g., "text/markdown")',
            },
            transform_from: {
              type: 'string',
              description: 'Source format (e.g., "text/plain")',
            },
            additional_data: {
              type: 'string',
              description: 'Additional configuration (JSON)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tag UUIDs',
            },
          },
          required: ['name', 'description', 'transform_to', 'transform_from'],
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
        const agentAddr = context.addressCache.get(agentUuid, 'AGENT', hubHost);
        const tagAddresses = ((args.tags as string[]) || []).map((t) =>
          context.addressCache.get(t, 'TAG', hubHost)
        );
        const transformData: Omit<CreateTransformRequest, 'signature'> = {
          uuid,
          name: args.name as string,
          description: args.description as string,
          transform_to: args.transform_to as string,
          transform_from: args.transform_from as string,
          additional_data: (args.additional_data as string) || '',
          tags: tagAddresses,
          agent: agentAddr,
        };

        const signature = await signTransform(transformData, privateKey);
        const projectUUID = context.config.config.current_project;
        const transform = await context.gateway.createTransform({
          ...transformData,
          signature,
        }, projectUUID);

        return {
          uuid: transform.uuid,
          name: transform.name,
          description: transform.description,
          transform_to: transform.transform_to,
          transform_from: transform.transform_from,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_auto_transform',
        description:
          'Automatically select the optimal transformer based on fragment type and context pressure, then return encoding instructions. Uses tested presets: T1-Symbolic (39% compression, 4.58/5 quality), T3-Compact (56%, 3.83/5), T4-Hybrid (24%, 5.0/5).',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to transform',
            },
            fragment_type: {
              type: 'string',
              enum: ['DEFINITION', 'PROCEDURE', 'FACT', 'OBSERVATION', 'HYPOTHESIS', 'SYNTHESIS', 'INSIGHT', 'OPINION', 'QUESTION', 'ANSWER', 'EXAMPLE', 'ANTITHESIS'],
              description: 'Type of the fragment (determines transformer selection)',
            },
            context_pressure: {
              type: 'number',
              description: 'How close to token budget (0.0 = plenty of space, 1.0 = nearly full). Higher pressure selects more aggressive compression. Default: 0.0',
            },
            preset_override: {
              type: 'string',
              enum: ['t1-symbolic', 't3-compact', 't4-hybrid', 'baseline'],
              description: 'Override automatic selection with a specific preset',
            },
          },
          required: ['content', 'fragment_type'],
        },
      },
      handler: async (args, _context) => {
        const fragmentType = args.fragment_type as string;
        const contextPressure = (args.context_pressure as number) || 0;
        const overridePreset = args.preset_override as string | undefined;

        const presetName = overridePreset || selectPreset(fragmentType, contextPressure);
        const preset = getPresetTransform(presetName);

        if (!preset) {
          throw new Error(`Unknown preset: ${presetName}`);
        }

        return {
          action: 'transform_request',
          direction: 'encode',
          selected_preset: presetName,
          preset_info: {
            name: preset.name,
            description: preset.description,
            expected_compression: `${Math.round(preset.expected_compression * 100)}%`,
            expected_quality: `${preset.expected_quality}/5`,
          },
          selection_reason: overridePreset
            ? `Manual override: ${overridePreset}`
            : `Auto-selected for ${fragmentType} at context pressure ${contextPressure}`,
          input: args.content,
          instructions: `${preset.encode_instructions}\n\nContent to transform:\n${args.content}\n\nReturn your result as JSON:\n{\n  "fragments": [\n    {\n      "content": "The encoded fragment",\n      "type": "${fragmentType}"\n    }\n  ]\n}\n\nAfter receiving this response, store the fragments with wisdom_store_transformed_fragments.`,
          available_presets: Object.entries(PRESETS).map(([key, p]) => ({
            key,
            name: p.name,
            compression: `${Math.round(p.expected_compression * 100)}%`,
            quality: `${p.expected_quality}/5`,
          })),
        };
      },
    },
  ];
}
