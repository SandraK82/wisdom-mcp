import * as ed from '@noble/ed25519';
import { toBase64, fromBase64 } from './keys.js';
import type {
  Agent,
  Fragment,
  Relation,
  Tag,
  Transform,
  TrustVote,
  CreateAgentRequest,
  CreateFragmentRequest,
  CreateRelationRequest,
  CreateTagRequest,
  CreateTransformRequest,
  CreateTrustVoteRequest,
} from '../gateway/types.js';

/**
 * Create a canonical JSON string for signing
 * Sorts keys to ensure deterministic output
 */
function canonicalize(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Sign a message with Ed25519
 */
export async function sign(
  message: string | Uint8Array,
  privateKey: Uint8Array
): Promise<string> {
  const messageBytes =
    typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const signature = await ed.signAsync(messageBytes, privateKey);
  return toBase64(signature);
}

/**
 * Verify an Ed25519 signature
 */
export async function verify(
  message: string | Uint8Array,
  signatureBase64: string,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    const messageBytes =
      typeof message === 'string' ? new TextEncoder().encode(message) : message;
    const signature = fromBase64(signatureBase64);
    return await ed.verifyAsync(signature, messageBytes, publicKey);
  } catch {
    return false;
  }
}

// ============================================================================
// Entity-specific signing functions
// ============================================================================

/**
 * Get signable payload for an Agent
 */
export function getAgentSignablePayload(agent: Omit<CreateAgentRequest, 'signature'>): string {
  return canonicalize({
    uuid: agent.uuid,
    public_key: agent.public_key,
    description: agent.description,
    trust: agent.trust || { direct: {}, default_trust: 0 },
    primary_hub: agent.primary_hub || null,
  });
}

/**
 * Sign an Agent
 */
export async function signAgent(
  agent: Omit<CreateAgentRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getAgentSignablePayload(agent);
  return sign(payload, privateKey);
}

/**
 * Verify an Agent signature
 */
export async function verifyAgent(
  agent: Agent,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getAgentSignablePayload(agent);
  return verify(payload, agent.signature, publicKey);
}

/**
 * Get signable payload for a Fragment
 */
export function getFragmentSignablePayload(
  fragment: Omit<CreateFragmentRequest, 'signature'>
): string {
  return canonicalize({
    uuid: fragment.uuid,
    content: fragment.content,
    creator: fragment.creator,
    when: fragment.when,
    tags: fragment.tags || [],
    transform: fragment.transform || null,
    confidence: fragment.confidence ?? 0.5,
    evidence_type: fragment.evidence_type || 'unknown',
  });
}

/**
 * Sign a Fragment
 */
export async function signFragment(
  fragment: Omit<CreateFragmentRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getFragmentSignablePayload(fragment);
  return sign(payload, privateKey);
}

/**
 * Verify a Fragment signature
 */
export async function verifyFragment(
  fragment: Fragment,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getFragmentSignablePayload(fragment);
  return verify(payload, fragment.signature, publicKey);
}

/**
 * Get signable payload for a Relation
 * Format aligned with wisdom-hub: "{from}:{to}:{type}:{creator}"
 */
export function getRelationSignablePayload(
  relation: Omit<CreateRelationRequest, 'signature'>
): string {
  return canonicalize({
    uuid: relation.uuid,
    from: relation.from,
    to: relation.to,
    by: relation.by,
    type: relation.type,
    content: relation.content || '',
    creator: relation.creator,
    when: relation.when,
  });
}

/**
 * Sign a Relation
 */
export async function signRelation(
  relation: Omit<CreateRelationRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getRelationSignablePayload(relation);
  return sign(payload, privateKey);
}

/**
 * Verify a Relation signature
 */
export async function verifyRelation(
  relation: Relation,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getRelationSignablePayload({
    uuid: relation.uuid,
    from: relation.from,
    to: relation.to,
    by: relation.by,
    type: relation.type,
    content: relation.content,
    creator: relation.creator,
    when: relation.when,
  });
  return verify(payload, relation.signature, publicKey);
}

/**
 * Get signable payload for a Tag
 * Format aligned with wisdom-hub: "{name}:{category}:{creator}"
 */
export function getTagSignablePayload(
  tag: Omit<CreateTagRequest, 'signature'>
): string {
  return canonicalize({
    uuid: tag.uuid,
    name: tag.name,
    content: tag.content,
    category: tag.category,
    creator: tag.creator,
  });
}

/**
 * Sign a Tag
 */
export async function signTag(
  tag: Omit<CreateTagRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getTagSignablePayload(tag);
  return sign(payload, privateKey);
}

/**
 * Verify a Tag signature
 */
export async function verifyTag(
  tag: Tag,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getTagSignablePayload({
    uuid: tag.uuid,
    name: tag.name,
    content: tag.content,
    category: tag.category,
    creator: tag.creator,
  });
  return verify(payload, tag.signature, publicKey);
}

/**
 * Get signable payload for a Transform
 * Format aligned with wisdom-hub: "{name}:{from}:{to}:{agent}"
 */
export function getTransformSignablePayload(
  transform: Omit<CreateTransformRequest, 'signature'>
): string {
  return canonicalize({
    uuid: transform.uuid,
    name: transform.name,
    description: transform.description,
    tags: transform.tags || [],
    transform_to: transform.transform_to,
    transform_from: transform.transform_from,
    additional_data: transform.additional_data || '',
    agent: transform.agent,
  });
}

/**
 * Sign a Transform
 */
export async function signTransform(
  transform: Omit<CreateTransformRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getTransformSignablePayload(transform);
  return sign(payload, privateKey);
}

/**
 * Verify a Transform signature
 */
export async function verifyTransform(
  transform: Transform,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getTransformSignablePayload({
    uuid: transform.uuid,
    name: transform.name,
    description: transform.description,
    tags: transform.tags,
    transform_to: transform.transform_to,
    transform_from: transform.transform_from,
    additional_data: transform.additional_data,
    agent: transform.agent,
  });
  return verify(payload, transform.signature, publicKey);
}

/**
 * Get signable payload for a TrustVote
 */
export function getTrustVoteSignablePayload(
  vote: Omit<CreateTrustVoteRequest, 'signature'>
): string {
  return canonicalize({
    uuid: vote.uuid,
    voter: vote.voter,
    target: vote.target,
    vote_type: vote.vote_type,
    comment: vote.comment || '',
  });
}

/**
 * Sign a TrustVote
 */
export async function signTrustVote(
  vote: Omit<CreateTrustVoteRequest, 'signature'>,
  privateKey: Uint8Array
): Promise<string> {
  const payload = getTrustVoteSignablePayload(vote);
  return sign(payload, privateKey);
}

/**
 * Verify a TrustVote signature
 */
export async function verifyTrustVote(
  vote: TrustVote,
  publicKey: Uint8Array
): Promise<boolean> {
  const payload = getTrustVoteSignablePayload(vote);
  return verify(payload, vote.signature, publicKey);
}
