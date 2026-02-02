/**
 * Gateway API types - matching the shared-wisdom Go backend
 */

// ============================================================================
// Hub Status Types (Resource Monitoring)
// ============================================================================

/**
 * Resource level indicating hub capacity status
 */
export type ResourceLevel = 'normal' | 'warning' | 'critical';

/**
 * Hub status information from resource monitoring
 */
export interface HubStatus {
  level: ResourceLevel;
  hint?: string;
  warnings?: string[];
}

// ============================================================================
// Trust Types
// ============================================================================

/**
 * Trust level expressed from one agent to another or to an entity
 */
export interface TrustExpression {
  trust: number; // -1.0 to +1.0
  confidence: number; // 0.0 to 1.0
}

/**
 * Trust map from agent UUID to trust expression
 */
export type TrustMap = Record<string, TrustExpression>;

/**
 * Agent's trust configuration
 */
export interface AgentTrust {
  direct: TrustMap;
  default_trust: number;
}

/**
 * A known bias or tendency of an agent
 */
export interface Bias {
  domain: string;
  description: string;
  severity: number; // 0.0 to 1.0
}

/**
 * Agent's expertise profile
 */
export interface AgentProfile {
  specializations: Record<string, number>; // Domain -> score (0.0 to 1.0)
  known_biases: Bias[];
  avg_confidence: number;
  fragment_count: number;
  historical_accuracy: number;
}

// ============================================================================
// Agent
// ============================================================================

export interface Agent {
  uuid: string;
  public_key: string; // Base64-encoded Ed25519 public key
  version: number;
  description: string;
  trust: AgentTrust;
  primary_hub: string | null;
  reputation_score: number;
  created_at: string;
  updated_at: string;
  signature: string;
  profile: AgentProfile; // Agent's expertise profile
}

export interface CreateAgentRequest {
  uuid: string;
  public_key: string;
  description: string;
  trust?: AgentTrust;
  primary_hub?: string | null;
  signature: string;
  profile?: AgentProfile;
}

// ============================================================================
// Fragment
// ============================================================================

export type FragmentState = 'proposed' | 'verified' | 'contested';

/**
 * Evidence type indicating how a fragment's content was derived
 */
export type EvidenceType =
  | 'empirical'   // Observed or tested
  | 'logical'     // Logically derived
  | 'consensus'   // Agreed upon by multiple sources
  | 'speculation' // Hypothetical
  | 'unknown';    // Not specified (default)

export interface Fragment {
  uuid: string;
  content: string;
  language: string;
  author: string; // Agent UUID (creator/signer)
  project: string | null; // Project UUID
  trust_summary: TrustSummary;
  state: FragmentState;
  source_transform: string | null; // Transform UUID if created via transform
  created_at: string;
  updated_at: string;
  signature: string;
  confidence: number; // Creator's confidence (0.0 to 1.0)
  evidence_type: EvidenceType; // How the content was derived
}

export interface TrustSummary {
  score: number;
  votes_count: number;
  verifications: number;
  contestations: number;
}

export interface CreateFragmentRequest {
  uuid: string;
  content: string;
  language: string;
  author: string;
  project?: string | null;
  source_transform?: string | null;
  signature: string;
  confidence?: number; // Creator's confidence (0.0 to 1.0)
  evidence_type?: EvidenceType; // How the content was derived
}

export interface SearchFragmentsRequest {
  query?: string;
  tags?: string[];
  author?: string;
  project?: string;
  state?: FragmentState;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Relation
// ============================================================================

export type RelationType =
  | 'REFERENCES'
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DERIVED_FROM'
  | 'PART_OF'
  | 'SUPERSEDES'
  | 'RELATES_TO'
  | 'TYPED_AS'; // For typing relations (QUESTION, ANSWER, etc.)

export interface Relation {
  uuid: string;
  source: string; // Entity UUID
  target: string; // Entity UUID
  relation_type: RelationType;
  metadata: Record<string, unknown>;
  author: string; // Agent UUID
  created_at: string;
  signature: string;
  confidence: number; // Strength of relationship (0.0 to 1.0)
}

export interface CreateRelationRequest {
  uuid: string;
  source: string;
  target: string;
  relation_type: RelationType;
  metadata?: Record<string, unknown>;
  author: string;
  signature: string;
  confidence?: number; // Strength of relationship (0.0 to 1.0)
}

// ============================================================================
// Tag
// ============================================================================

export interface Tag {
  uuid: string;
  name: string;
  category: string;
  description: string;
  author: string;
  created_at: string;
  signature: string;
}

export interface CreateTagRequest {
  uuid: string;
  name: string;
  category: string;
  description: string;
  author: string;
  signature: string;
}

// ============================================================================
// Transform
// ============================================================================

export interface Transform {
  uuid: string;
  name: string;
  description: string;
  domain: string; // e.g., "software", "science", "general"
  spec: string; // Markdown spec content
  version: number;
  author: string;
  tags: string[]; // Tag UUIDs
  created_at: string;
  updated_at: string;
  signature: string;
}

export interface CreateTransformRequest {
  uuid: string;
  name: string;
  description: string;
  domain: string;
  spec: string;
  tags?: string[];
  author: string;
  signature: string;
}

// ============================================================================
// Project (Gateway-only, not federated)
// ============================================================================

export interface Project {
  uuid: string;
  name: string;
  description: string;
  owner: string; // Agent UUID
  default_tags: string[];
  default_transform: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  uuid: string;
  name: string;
  description: string;
  owner: string;
  default_tags?: string[];
  default_transform?: string | null;
}

// ============================================================================
// Trust Vote
// ============================================================================

export type VoteType = 'verify' | 'contest' | 'retract';

export interface TrustVote {
  uuid: string;
  voter: string; // Agent UUID
  target: string; // Fragment UUID (or other entity)
  vote_type: VoteType;
  comment: string;
  created_at: string;
  signature: string;
}

export interface CreateTrustVoteRequest {
  uuid: string;
  voter: string;
  target: string;
  vote_type: VoteType;
  comment?: string;
  signature: string;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Fragment Type Tags (Pseudo-types via Relations)
// ============================================================================

/**
 * Well-known fragment types expressed via TYPED_AS relations
 */
export const FragmentTypes = {
  QUESTION: 'type:question',
  ANSWER: 'type:answer',
  FACT: 'type:fact',
  OPINION: 'type:opinion',
  DEFINITION: 'type:definition',
  EXAMPLE: 'type:example',
  PROCEDURE: 'type:procedure',
  INSIGHT: 'type:insight',
} as const;

export type FragmentType = (typeof FragmentTypes)[keyof typeof FragmentTypes];
