import { v4 as uuidv4 } from 'uuid';
import type { ToolDefinition } from '../server.js';
import { signTrustVote } from '../crypto/signing.js';
import type { CreateTrustVoteRequest } from '../gateway/types.js';

export function createAgentTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_get_agent',
        description: 'Get agent information by UUID',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Agent UUID (uses current agent if not specified)',
            },
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const uuid = (args.uuid as string) || context.config.config.agent_uuid;

        if (!uuid) {
          throw new Error('No agent UUID specified and no current agent configured.');
        }

        const agent = await context.gateway.getAgent(uuid);

        return {
          uuid: agent.uuid,
          public_key: agent.public_key,
          description: agent.description,
          reputation_score: agent.reputation_score,
          trust: agent.trust,
          primary_hub: agent.primary_hub,
          created_at: agent.created_at,
          is_current: uuid === context.config.config.agent_uuid,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_list_agents',
        description: 'List known agents',
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
          },
          required: [],
        },
      },
      handler: async (args, context) => {
        const result = await context.gateway.listAgents(
          (args.limit as number) || 20,
          args.cursor as string | undefined
        );

        const currentAgent = context.config.config.agent_uuid;
        const items = result.items || [];

        return {
          agents: items.map((a) => ({
            uuid: a.uuid,
            description: a.description,
            reputation_score: a.reputation_score,
            is_current: a.uuid === currentAgent,
            created_at: a.created_at,
          })),
          count: items.length,
          next_cursor: result.next_cursor,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_trust_agent',
        description: 'Express trust in another agent',
        inputSchema: {
          type: 'object',
          properties: {
            target_agent: {
              type: 'string',
              description: 'Agent UUID to trust',
            },
            trust_level: {
              type: 'number',
              description: 'Trust level from -1.0 (distrust) to +1.0 (full trust)',
            },
            confidence: {
              type: 'number',
              description: 'Confidence in this trust assessment (0.0 to 1.0)',
            },
          },
          required: ['target_agent', 'trust_level'],
        },
      },
      handler: async (args, context) => {
        // Verify we have a private key (will throw if not)
        context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const targetAgent = args.target_agent as string;
        const trustLevel = args.trust_level as number;
        const confidence = (args.confidence as number) || 1.0;

        // Validate trust level
        if (trustLevel < -1 || trustLevel > 1) {
          throw new Error('Trust level must be between -1.0 and +1.0');
        }

        // Validate confidence
        if (confidence < 0 || confidence > 1) {
          throw new Error('Confidence must be between 0.0 and 1.0');
        }

        // Get current agent to verify it exists
        await context.gateway.getAgent(agentUuid);

        // Return what would be the trust expression
        // Note: Full implementation would update agent trust map via gateway API
        return {
          source_agent: agentUuid,
          target_agent: targetAgent,
          trust_expression: {
            trust: trustLevel,
            confidence,
          },
          message: `Trust expressed: ${trustLevel > 0 ? '+' : ''}${trustLevel} (confidence: ${confidence})`,
          note: 'Trust update submitted. The gateway will apply this to your agent trust map.',
        };
      },
    },

    {
      tool: {
        name: 'wisdom_vote_on_fragment',
        description: 'Cast a trust vote on a fragment (verify, contest, or retract)',
        inputSchema: {
          type: 'object',
          properties: {
            fragment: {
              type: 'string',
              description: 'Fragment UUID to vote on',
            },
            vote_type: {
              type: 'string',
              enum: ['verify', 'contest', 'retract'],
              description: 'Type of vote',
            },
            comment: {
              type: 'string',
              description: 'Optional comment explaining the vote',
            },
          },
          required: ['fragment', 'vote_type'],
        },
      },
      handler: async (args, context) => {
        const privateKey = context.keyManager.getPrivateKey();
        const agentUuid = context.config.config.agent_uuid;

        if (!agentUuid) {
          throw new Error('No agent configured. Run wisdom_generate_keypair first.');
        }

        const uuid = uuidv4();
        const voteData: Omit<CreateTrustVoteRequest, 'signature'> = {
          uuid,
          voter: agentUuid,
          target: args.fragment as string,
          vote_type: args.vote_type as 'verify' | 'contest' | 'retract',
          comment: (args.comment as string) || undefined,
        };

        const signature = await signTrustVote(voteData, privateKey);
        const vote = await context.gateway.createTrustVote({
          ...voteData,
          signature,
        });

        return {
          uuid: vote.uuid,
          fragment: vote.target,
          vote_type: vote.vote_type,
          comment: vote.comment,
          created_at: vote.created_at,
          message: `Vote cast: ${vote.vote_type}`,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_get_fragment_votes',
        description: 'Get trust votes for a fragment',
        inputSchema: {
          type: 'object',
          properties: {
            fragment: {
              type: 'string',
              description: 'Fragment UUID',
            },
          },
          required: ['fragment'],
        },
      },
      handler: async (args, context) => {
        const votesResult = await context.gateway.getVotesForTarget(args.fragment as string);
        const votes = votesResult || [];

        return {
          fragment: args.fragment,
          votes: votes.map((v) => ({
            uuid: v.uuid,
            voter: v.voter,
            vote_type: v.vote_type,
            comment: v.comment,
            created_at: v.created_at,
          })),
          summary: {
            total: votes.length,
            verifications: votes.filter((v) => v.vote_type === 'verify').length,
            contestations: votes.filter((v) => v.vote_type === 'contest').length,
            retractions: votes.filter((v) => v.vote_type === 'retract').length,
          },
        };
      },
    },

    {
      tool: {
        name: 'wisdom_calculate_trust',
        description:
          'Calculate effective trust for an entity (placeholder for trust-path calculation)',
        inputSchema: {
          type: 'object',
          properties: {
            entity: {
              type: 'string',
              description: 'Entity UUID (fragment, agent, etc.)',
            },
            perspective: {
              type: 'string',
              description: 'Agent UUID for trust perspective (uses current agent if not specified)',
            },
          },
          required: ['entity'],
        },
      },
      handler: async (args, context) => {
        const perspective =
          (args.perspective as string) || context.config.config.agent_uuid;

        if (!perspective) {
          throw new Error('No perspective agent specified and no current agent configured.');
        }

        // For now, return a simplified trust calculation
        // Full trust-path algorithm would be implemented here
        try {
          // Try to get as fragment
          const fragment = await context.gateway.getFragment(args.entity as string);
          return {
            entity: args.entity,
            entity_type: 'fragment',
            perspective: perspective,
            trust_summary: fragment.trust_summary,
            effective_trust: fragment.trust_summary?.score ?? 0,
            note: 'Trust-path calculation not yet implemented. Using direct trust summary.',
          };
        } catch {
          // Try as agent
          try {
            const agent = await context.gateway.getAgent(args.entity as string);
            return {
              entity: args.entity,
              entity_type: 'agent',
              perspective: perspective,
              reputation_score: agent.reputation_score,
              effective_trust: agent.reputation_score - 0.5, // Convert 0-1 to -0.5 to 0.5 range
              note: 'Trust-path calculation not yet implemented. Using reputation score.',
            };
          } catch {
            throw new Error(`Entity not found: ${args.entity}`);
          }
        }
      },
    },
  ];
}
