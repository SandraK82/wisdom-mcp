import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signRelation } from '../crypto/signing.js';
import type { CreateRelationRequest, RelationType } from '../gateway/types.js';
import { createLocalAddress, addressToString } from '../gateway/types.js';

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
                'TRUST',
                'SUPPORTS',
                'CONTRADICTS',
                'EXTENDS',
                'SUPERSEDES',
                'DERIVED_FROM',
                'RELATED_TO',
                'EXAMPLE_OF',
                'SPECIALIZES',
                'CLARIFIES',
                'GENERALIZES',
              ],
              description: 'Type of relation',
            },
            content: {
              type: 'string',
              description: 'Optional reasoning or explanation',
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
        const creatorAddr = createLocalAddress('AGENT', agentUuid);
        const fromAddr = createLocalAddress('FRAGMENT', args.source as string);
        const toAddr = createLocalAddress('FRAGMENT', args.target as string);
        const now = new Date().toISOString();

        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          from: fromAddr,
          to: toAddr,
          by: creatorAddr,
          type: args.relation_type as RelationType,
          content: (args.content as string) || '',
          creator: creatorAddr,
          when: now,
        };

        const signature = await signRelation(relationData, privateKey);
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        });

        return {
          uuid: relation.uuid,
          from: addressToString(relation.from),
          to: addressToString(relation.to),
          type: relation.type,
          content: relation.content,
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
        const relationsResult = await context.gateway.getRelationsForEntity(
          args.entity as string,
          args.direction as 'source' | 'target' | 'both' | undefined
        );
        const relations = relationsResult || [];

        return {
          relations: relations.map((r) => ({
            uuid: r.uuid,
            from: addressToString(r.from),
            to: addressToString(r.to),
            type: r.type,
            content: r.content,
            by: addressToString(r.by),
            confidence: r.confidence,
          })),
          count: relations.length,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_type_fragment',
        description:
          'Assign a semantic type to a fragment (QUESTION, ANSWER, FACT, etc.) via TYPE tag',
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
                'HYPOTHESIS',
                'ANTITHESIS',
                'SYNTHESIS',
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

        // Convert type name to lowercase tag name (e.g., "FACT" -> "fact")
        const typeName = (args.fragment_type as string).toLowerCase();

        // Look up the TYPE tag by name
        const typeTag = await context.gateway.getTagByName(typeName);
        if (!typeTag) {
          throw new Error(
            `Type tag '${typeName}' not found. Create it first with: wisdom_create_tag --name ${typeName} --category TYPE`
          );
        }
        if (typeTag.category !== 'TYPE') {
          throw new Error(
            `Tag '${typeName}' exists but is not a TYPE tag (category: ${typeTag.category})`
          );
        }

        const uuid = uuidv4();
        const creatorAddr = createLocalAddress('AGENT', agentUuid);
        const fragmentAddr = createLocalAddress('FRAGMENT', args.fragment as string);
        const tagAddr = createLocalAddress('TAG', typeTag.uuid);
        const now = new Date().toISOString();

        // Create RELATED_TO relation from fragment to TYPE tag
        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          from: fragmentAddr,
          to: tagAddr,
          by: creatorAddr,
          type: 'RELATED_TO',
          content: `Fragment typed as ${args.fragment_type}`,
          creator: creatorAddr,
          when: now,
        };

        const signature = await signRelation(relationData, privateKey);
        const relation = await context.gateway.createRelation({
          ...relationData,
          signature,
        });

        return {
          uuid: relation.uuid,
          fragment: addressToString(relation.from),
          fragment_type: args.fragment_type,
          type_tag: typeName,
          type_tag_uuid: typeTag.uuid,
          message: `Fragment typed as ${args.fragment_type} via RELATED_TO relation to TYPE tag`,
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

        const uuid = uuidv4();
        const creatorAddr = createLocalAddress('AGENT', agentUuid);
        const answerAddr = createLocalAddress('FRAGMENT', args.answer as string);
        const questionAddr = createLocalAddress('FRAGMENT', args.question as string);
        const now = new Date().toISOString();

        const relationData: Omit<CreateRelationRequest, 'signature'> = {
          uuid,
          from: answerAddr,
          to: questionAddr,
          by: creatorAddr,
          type: 'SUPPORTS',
          content: 'Answer to question',
          creator: creatorAddr,
          when: now,
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
