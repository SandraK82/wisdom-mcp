import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signRelation } from '../crypto/signing.js';
import type { CreateRelationRequest, RelationType } from '../gateway/types.js';
import { FragmentTypes } from '../gateway/types.js';

export function createRelationTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_create_relation',
        description: 'Create a relation between two entities (fragments, tags, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source entity UUID',
            },
            target: {
              type: 'string',
              description: 'Target entity UUID',
            },
            relation_type: {
              type: 'string',
              enum: [
                'REFERENCES',
                'SUPPORTS',
                'CONTRADICTS',
                'DERIVED_FROM',
                'PART_OF',
                'SUPERSEDES',
                'RELATES_TO',
                'TYPED_AS',
              ],
              description: 'Type of relation',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata for the relation',
            },
          },
          required: ['source', 'target', 'relation_type'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          source: args.source as string,
          target: args.target as string,
          relation_type: args.relation_type as RelationType,
          metadata: (args.metadata as Record<string, unknown>) || {},
          author: agentUuid,
        };

        const signature = await signRelation(relationData, privateKey);
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        });

        return {
          uuid: relation.uuid,
          source: relation.source,
          target: relation.target,
          relation_type: relation.relation_type,
          metadata: relation.metadata,
          created_at: relation.created_at,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_relations',
        description: 'Get relations for an entity',
        inputSchema: {
          type: 'object',
          properties: {
            entity: {
              type: 'string',
              description: 'Entity UUID to get relations for',
            },
            direction: {
              type: 'string',
              enum: ['source', 'target', 'both'],
              description: 'Filter by relation direction (default: both)',
            },
          },
          required: ['entity'],
        },
      },
      handler: async (args, context) => {
        const relations = await context.gateway.getRelationsForEntity(
          args.entity as string,
          args.direction as 'source' | 'target' | 'both' | undefined
        );

        return {
          relations: relations.map((r) => ({
            uuid: r.uuid,
            source: r.source,
            target: r.target,
            relation_type: r.relation_type,
            metadata: r.metadata,
            author: r.author,
          })),
          count: relations.length,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_type_fragment',
        description:
          'Assign a semantic type to a fragment (QUESTION, ANSWER, FACT, etc.) via TYPED_AS relation',
        inputSchema: {
          type: 'object',
          properties: {
            fragment: {
              type: 'string',
              description: 'Fragment UUID to type',
            },
            fragment_type: {
              type: 'string',
              enum: [
                'QUESTION',
                'ANSWER',
                'FACT',
                'OPINION',
                'DEFINITION',
                'EXAMPLE',
                'PROCEDURE',
                'INSIGHT',
              ],
              description: 'Semantic type to assign',
            },
          },
          required: ['fragment', 'fragment_type'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        // Map type name to type tag value
        const typeKey = args.fragment_type as keyof typeof FragmentTypes;
        const typeValue = FragmentTypes[typeKey];

        if (!typeValue) {
          throw new Error(`Unknown fragment type: ${args.fragment_type}`);
        }

        const uuid = uuidv4();
        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          source: args.fragment as string,
          target: typeValue, // e.g., "type:question"
          relation_type: 'TYPED_AS',
          metadata: { type_name: args.fragment_type },
          author: agentUuid,
        };

        const signature = await signRelation(relationData, privateKey);
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        });

        return {
          uuid: relation.uuid,
          fragment: relation.source,
          fragment_type: args.fragment_type,
          type_tag: typeValue,
          message: `Fragment typed as ${args.fragment_type}`,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_link_answer',
        description: 'Link an answer fragment to a question fragment',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Question fragment UUID',
            },
            answer: {
              type: 'string',
              description: 'Answer fragment UUID',
            },
          },
          required: ['question', 'answer'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        // Create SUPPORTS relation from answer to question
        const uuid = uuidv4();
        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          source: args.answer as string,
          target: args.question as string,
          relation_type: 'SUPPORTS',
          metadata: { link_type: 'answer_to_question' },
          author: agentUuid,
        };

        const signature = await signRelation(relationData, privateKey);
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        });

        return {
          uuid: relation.uuid,
          question: args.question,
          answer: args.answer,
          message: 'Answer linked to question via SUPPORTS relation',
        };
      },
    },
  ];
}
