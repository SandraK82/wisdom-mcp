/**
 * Validity and evidence analysis tools for the wisdom system
 */

import type { ToolDefinition } from '../server.js';
import type { Relation } from '../gateway/types.js';
import { addressToString } from '../gateway/types.js';

// ============================================================================
// Types
// ============================================================================

type ChainValidity = 'valid' | 'conditional' | 'contested' | 'broken';

type IssueType =
  | 'missing_reference'
  | 'contested_premise'
  | 'low_confidence'
  | 'unverified_source'
  | 'circular_dependency';

interface ValidityIssue {
  fragment_id: string;
  issue_type: IssueType;
  description: string;
  severity: number;
}



interface EvidenceBalance {
  thesis_id: string;
  supporting: Array<{ fragment_id: string; confidence: number }>;
  contradicting: Array<{ fragment_id: string; confidence: number }>;
  support_score: number;
  contradict_score: number;
  net_score: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateEvidenceBalance(thesisId: string, relations: Relation[]): EvidenceBalance {
  const balance: EvidenceBalance = {
    thesis_id: thesisId,
    supporting: [],
    contradicting: [],
    support_score: 0,
    contradict_score: 0,
    net_score: 0,
  };

  for (const relation of relations) {
    // Compare target entity UUID with thesisId
    if (relation.to.entity === thesisId) {
      const confidence = relation.confidence ?? 1.0;
      if (relation.type === 'SUPPORTS') {
        balance.supporting.push({ fragment_id: relation.from.entity, confidence });
        balance.support_score += confidence;
      } else if (relation.type === 'CONTRADICTS') {
        balance.contradicting.push({ fragment_id: relation.from.entity, confidence });
        balance.contradict_score += confidence;
      }
    }
  }

  balance.net_score = balance.support_score - balance.contradict_score;
  return balance;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export function createValidityTools(): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'wisdom_get_evidence_balance',
        description:
          'Find all supporting and contradicting evidence for a thesis fragment. Returns weighted scores.',
        inputSchema: {
          type: 'object',
          properties: {
            fragment_id: {
              type: 'string',
              description: 'UUID of the thesis fragment to analyze',
            },
          },
          required: ['fragment_id'],
        },
      },
      handler: async (args, context) => {
        const fragmentId = args.fragment_id as string;

        // Get the fragment first to verify it exists
        const fragment = await context.gateway.getFragment(fragmentId);
        if (!fragment) {
          throw new Error(`Fragment not found: ${fragmentId}`);
        }

        // Get all relations involving this fragment
        const relations = await context.gateway.listRelations(100);
        const relationsData = relations.items || [];

        // Calculate evidence balance
        const balance = calculateEvidenceBalance(fragmentId, relationsData);

        return {
          thesis: {
            uuid: fragment.uuid,
            content: fragment.content.substring(0, 200) + (fragment.content.length > 200 ? '...' : ''),
            confidence: fragment.confidence,
            evidence_type: fragment.evidence_type,
          },
          supporting: balance.supporting,
          contradicting: balance.contradicting,
          support_score: Math.round(balance.support_score * 100) / 100,
          contradict_score: Math.round(balance.contradict_score * 100) / 100,
          net_score: Math.round(balance.net_score * 100) / 100,
          verdict:
            balance.net_score > 0.5
              ? 'well_supported'
              : balance.net_score < -0.5
                ? 'contested'
                : 'neutral',
        };
      },
    },

    {
      tool: {
        name: 'wisdom_find_contradictions',
        description:
          'Find potential contradictions to a fragment by searching for CONTRADICTS relations',
        inputSchema: {
          type: 'object',
          properties: {
            fragment_id: {
              type: 'string',
              description: 'UUID of the fragment to find contradictions for',
            },
          },
          required: ['fragment_id'],
        },
      },
      handler: async (args, context) => {
        const fragmentId = args.fragment_id as string;

        // Get the fragment
        const fragment = await context.gateway.getFragment(fragmentId);
        if (!fragment) {
          throw new Error(`Fragment not found: ${fragmentId}`);
        }

        // Get all relations
        const relations = await context.gateway.listRelations(100);
        const relationsData = relations.items || [];

        // Find contradicting relations
        const contradictions = relationsData.filter(
          (r) => r.to.entity === fragmentId && r.type === 'CONTRADICTS'
        );

        // Get the contradicting fragments
        const contradictingFragments = await Promise.all(
          contradictions.map(async (rel) => {
            try {
              const frag = await context.gateway.getFragment(rel.from.entity);
              return {
                uuid: frag.uuid,
                content: frag.content.substring(0, 200) + (frag.content.length > 200 ? '...' : ''),
                confidence: frag.confidence,
                relation_confidence: rel.confidence,
                creator: addressToString(frag.creator),
              };
            } catch {
              return {
                uuid: rel.from.entity,
                content: '[Fragment not found]',
                confidence: 0,
                relation_confidence: rel.confidence,
                creator: 'unknown',
              };
            }
          })
        );

        return {
          fragment_id: fragmentId,
          contradiction_count: contradictingFragments.length,
          contradictions: contradictingFragments,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_check_derivation_chain',
        description:
          'Check the integrity of a derivation chain (DERIVED_FROM relations) for a fragment',
        inputSchema: {
          type: 'object',
          properties: {
            fragment_id: {
              type: 'string',
              description: 'UUID of the fragment to check derivation chain for',
            },
            max_depth: {
              type: 'number',
              description: 'Maximum depth to traverse (default: 10)',
            },
          },
          required: ['fragment_id'],
        },
      },
      handler: async (args, context) => {
        const fragmentId = args.fragment_id as string;
        const maxDepth = (args.max_depth as number) || 10;

        // Get all relations
        const relations = await context.gateway.listRelations(500);
        const relationsData = relations.items || [];

        // Build derivation chain
        const chain: Array<{
          fragment_id: string;
          depth: number;
          derives_from: string[];
        }> = [];
        const visited = new Set<string>();
        const issues: ValidityIssue[] = [];

        async function traverse(fragId: string, depth: number): Promise<void> {
          if (depth > maxDepth || visited.has(fragId)) {
            if (visited.has(fragId)) {
              issues.push({
                fragment_id: fragId,
                issue_type: 'circular_dependency',
                description: `Circular dependency detected at fragment ${fragId}`,
                severity: 1.0,
              });
            }
            return;
          }

          visited.add(fragId);

          // Find DERIVED_FROM relations for this fragment
          const derivedFromRelations = relationsData.filter(
            (r) => r.from.entity === fragId && r.type === 'DERIVED_FROM'
          );

          const derivesFrom = derivedFromRelations.map((r) => r.to.entity);

          chain.push({
            fragment_id: fragId,
            depth,
            derives_from: derivesFrom,
          });

          // Check if sources exist
          for (const sourceId of derivesFrom) {
            try {
              await context.gateway.getFragment(sourceId);
            } catch {
              issues.push({
                fragment_id: fragId,
                issue_type: 'missing_reference',
                description: `Fragment ${fragId} derives from non-existent fragment ${sourceId}`,
                severity: 1.0,
              });
            }
          }

          // Traverse deeper
          for (const sourceId of derivesFrom) {
            await traverse(sourceId, depth + 1);
          }
        }

        await traverse(fragmentId, 0);

        // Determine overall validity
        let validity: ChainValidity = 'valid';
        if (issues.some((i) => i.issue_type === 'missing_reference' || i.issue_type === 'circular_dependency')) {
          validity = 'broken';
        }

        return {
          fragment_id: fragmentId,
          validity,
          chain_depth: chain.length,
          derivation_chain: chain,
          issues,
        };
      },
    },

    {
      tool: {
        name: 'wisdom_load_context_for_task',
        description:
          'Load the most relevant fragments for a task, filtered by trust and confidence within a token budget',
        inputSchema: {
          type: 'object',
          properties: {
            task_description: {
              type: 'string',
              description: 'Description of the task to find relevant fragments for',
            },
            token_budget: {
              type: 'number',
              description: 'Maximum approximate tokens to return (default: 10000)',
            },
            min_confidence: {
              type: 'number',
              description: 'Minimum confidence threshold (default: 0.3)',
            },
            project: {
              type: 'string',
              description: 'Filter by project UUID',
            },
          },
          required: ['task_description'],
        },
      },
      handler: async (args, context) => {
        const taskDescription = args.task_description as string;
        const tokenBudget = (args.token_budget as number) || 10000;
        const minConfidence = (args.min_confidence as number) || 0.3;
        const project = (args.project as string) || context.config.config.current_project;

        // Search for relevant fragments
        const searchResult = await context.gateway.searchFragments({
          query: taskDescription,
          project: project || undefined,
          limit: 50,
        });
        const searchData = searchResult.items || [];

        // Filter by confidence and calculate relevance
        const filteredFragments = searchData
          .filter((f) => (f.confidence ?? 0.5) >= minConfidence)
          .map((f) => ({
            ...f,
            // Simple relevance score based on trust and confidence
            relevance_score: ((f.trust_summary?.score ?? 0) + 1) / 2 * (f.confidence ?? 0.5),
          }))
          .sort((a, b) => b.relevance_score - a.relevance_score);

        // Fit within token budget (rough estimate: 4 chars = 1 token)
        const charsPerToken = 4;
        let totalChars = 0;
        const selectedFragments: typeof filteredFragments = [];

        for (const fragment of filteredFragments) {
          const fragChars = fragment.content.length + 100; // overhead for metadata
          if (totalChars + fragChars > tokenBudget * charsPerToken) {
            break;
          }
          totalChars += fragChars;
          selectedFragments.push(fragment);
        }

        return {
          task: taskDescription,
          token_budget: tokenBudget,
          estimated_tokens: Math.ceil(totalChars / charsPerToken),
          fragments_found: searchData.length,
          fragments_returned: selectedFragments.length,
          fragments: selectedFragments.map((f) => ({
            uuid: f.uuid,
            content: f.content,
            confidence: f.confidence,
            evidence_type: f.evidence_type,
            trust_score: f.trust_summary?.score ?? 0,
            relevance_score: Math.round(f.relevance_score * 100) / 100,
          })),
        };
      },
    },
  ];
}
