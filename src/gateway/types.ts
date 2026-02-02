/**
 * Gateway API types - matching the shared-wisdom Go backend
 */

// ============================================================================
// Address Type (Federated Identifier)
// ============================================================================

/**
 * Address domain types for entity references
 */
export type AddressDomain = 'AGENT' | 'TAG' | 'FRAGMENT' | 'RELATION' | 'TRANSFORMATION' | 'HUB';

/**
 * Address is a federated identifier for any entity in the network.
 * Format: "server:port/DOMAIN/entity-uuid"
 */
export interface Address {
  server_port: string; // FQDN:port (e.g., "hub.example.com:8443"), empty for local
  domain: AddressDomain; // Entity type
  entity: string; // UUID of the entity
}

/**
 * Create a local address (no server specified)
 */
export function createLocalAddress(domain: AddressDomain, entity: string): Address {
  return { server_port: '', domain, entity };
}

/**
 * Convert an Address to its string representation
 * Format: "server:port/DOMAIN/entity-uuid" or "/DOMAIN/entity-uuid" for local
 */
export function addressToString(addr: Address): string {
  if (!addr.server_port && !addr.domain && !addr.entity) return '';
  if (!addr.server_port) return `/${addr.domain}/${addr.entity}`;
  return `${addr.server_port}/${addr.domain}/${addr.entity}`;
}

/**
 * Parse an address string into an Address object
 */
export function parseAddress(s: string): Address {
  if (!s) return { server_port: '', domain: 'AGENT', entity: '' };

  const parts = s.split('/');

  // Local address: /DOMAIN/entity
  if (s.startsWith('/') && parts.length === 3) {
    return {
      server_port: '',
      domain: parts[1] as AddressDomain,
      entity: parts[2],
    };
  }

  // Remote address: server:port/DOMAIN/entity
  if (parts.length === 3) {
    return {
      server_port: parts[0],
      domain: parts[1] as AddressDomain,
      entity: parts[2],
    };
  }

  throw new Error(`Invalid address format: ${s}`);
}

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
  content_hash?: string; // SHA-256 hash of content
  tags: Address[]; // References to Tag entities
  transform: Address; // Reference to Transform entity
  creator: Address; // Agent who created this fragment
  version: number; // Incremented on updates
  when: string; // Content timestamp (ISO format)
  signature: string;
  confidence: number; // Creator's confidence (0.0 to 1.0)
  evidence_type: EvidenceType; // How the content was derived
  created_at?: string; // Database creation timestamp
  updated_at?: string; // Database update timestamp
  // Computed/optional fields from gateway
  trust_summary?: TrustSummary;
  state?: FragmentState;
}

export interface TrustSummary {
  score: number;
  votes_count: number;
  verifications: number;
  contestations: number;
}

/**
 * Request to create a fragment - matches Gateway's expected format
 */
export interface CreateFragmentRequest {
  uuid: string;
  content: string;
  creator: Address; // Agent address who created this fragment
  when: string; // ISO timestamp
  signature: string;
  tags?: Address[]; // Tag addresses
  transform?: Address; // Transform address if created via transformation
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

/**
 * Relation types - matching wisdom-hub enum.
 * Note: Fragment typing (QUESTION, HYPOTHESE, etc.) now uses TYPE tags instead.
 */
export type RelationType =
  // Trust
  | 'TRUST'
  // Content relationships
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'EXTENDS'
  | 'SUPERSEDES'
  | 'DERIVED_FROM'
  | 'RELATED_TO'
  | 'EXAMPLE_OF'
  // Refinement relations
  | 'SPECIALIZES'
  | 'CLARIFIES'
  | 'GENERALIZES';

export interface Relation {
  uuid: string;
  from: Address; // Source entity address
  to: Address; // Target entity address (optional for self-reference)
  by: Address; // Agent who asserts this relation
  type: RelationType; // Type of relationship
  content?: string; // Optional: reasoning/explanation
  creator: Address; // Agent who created this relation
  version: number; // Incremented on updates
  when: string; // Creation timestamp
  signature: string;
  confidence: number; // Strength of relationship (0.0 to 1.0)
  created_at?: string; // Database creation timestamp
}

export interface CreateRelationRequest {
  uuid: string;
  from: Address; // Source entity address
  to: Address; // Target entity address
  by: Address; // Agent who asserts this relation
  type: RelationType;
  content?: string;
  creator: Address;
  when: string;
  signature: string;
  confidence?: number;
}

// ============================================================================
// Tag
// ============================================================================

/**
 * Tag categories - matching wisdom-hub enum
 */
export type TagCategory =
  | 'PLATFORM'
  | 'LANGUAGE'
  | 'FRAMEWORK'
  | 'LIBRARY'
  | 'VERSION'
  | 'DOMAIN'
  | 'TYPE'
  | 'ENVIRONMENT'
  | 'ARCHITECTURE'
  | 'COUNTRY'
  | 'FIELD';

export interface Tag {
  uuid: string;
  name: string;
  content: string; // Description of the tag (was: description)
  category: TagCategory;
  creator: Address; // Agent who created this tag (was: author)
  version: number;
  signature: string;
  created_at?: string;
}

export interface CreateTagRequest {
  uuid: string;
  name: string;
  content: string; // Was: description
  category: TagCategory;
  creator: Address; // Was: author
  signature: string;
}

// ============================================================================
// Transform
// ============================================================================

export interface Transform {
  uuid: string;
  name: string;
  description: string;
  tags: Address[]; // Related tags as addresses
  transform_to: string; // Target format (e.g., "text/markdown")
  transform_from: string; // Source format (e.g., "text/plain")
  additional_data?: string; // JSON with extra configuration
  agent: Address; // Agent who created this transform (was: author)
  version: number;
  signature: string;
  created_at?: string;
}

export interface CreateTransformRequest {
  uuid: string;
  name: string;
  description: string;
  tags?: Address[];
  transform_to: string;
  transform_from: string;
  additional_data?: string;
  agent: Address;
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

/**
 * Legacy offset-based pagination response
 * @deprecated Use CursorPaginatedResponse for new code
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Cursor-based pagination response - matches wisdom-hub API format
 */
export interface CursorPaginatedResponse<T> {
  items: T[];
  next_cursor?: string;
}

// ============================================================================
// Fragment Type Tags
// ============================================================================

/**
 * Well-known fragment types expressed via TYPE tags.
 * These are tag names (lowercase) in the TYPE category.
 */
export const FragmentTypes = {
  QUESTION: 'question',
  ANSWER: 'answer',
  FACT: 'fact',
  OPINION: 'opinion',
  DEFINITION: 'definition',
  EXAMPLE: 'example',
  PROCEDURE: 'procedure',
  INSIGHT: 'insight',
  HYPOTHESIS: 'hypothesis',
  ANTITHESIS: 'antithesis',
  SYNTHESIS: 'synthesis',
} as const;

export type FragmentType = (typeof FragmentTypes)[keyof typeof FragmentTypes];
