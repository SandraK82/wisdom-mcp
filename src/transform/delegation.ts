/**
 * Transform delegation protocol for host-based LLM transformations
 *
 * The wisdom-mcp server does NOT call LLMs directly.
 * Instead, it returns structured delegation requests that the host (Claude)
 * processes and returns results for.
 */

/**
 * Transform request returned to the host
 */
export interface TransformDelegationRequest {
  action: 'transform_request';
  direction: 'encode' | 'decode';
  input: string;
  source_language?: string;
  target_language: string;
  domain?: string;
  transform_spec: string | null;
  instructions: string;
}

/**
 * Expected response format from host for encode operations
 */
export interface EncodeResponse {
  fragments: Array<{
    content: string;
    type?: string;
  }>;
  source_language_detected?: string;
}

/**
 * Expected response format from host for decode operations
 */
export interface DecodeResponse {
  content: string;
  notes?: string;
}

/**
 * Tag suggestion request returned to the host
 */
export interface TagSuggestionRequest {
  action: 'tag_suggestion_request';
  content: string;
  existing_tags: Array<{
    uuid: string;
    name: string;
    category: string;
    description: string;
  }>;
  max_suggestions: number;
  instructions: string;
}

/**
 * Expected response format from host for tag suggestions
 */
export interface TagSuggestionResponse {
  existing_tags: string[]; // UUIDs
  new_tags: Array<{
    name: string;
    category: string;
    description: string;
  }>;
}

/**
 * Create a standard encode instruction
 */
export function createEncodeInstructions(
  content: string,
  transformSpec: string | null
): string {
  let instructions = `Please transform the following content into one or more English knowledge fragments. Each fragment should be:
1. Self-contained and atomic (one concept per fragment)
2. Written in clear, precise English
3. Factual and verifiable where possible

`;

  if (transformSpec) {
    instructions += `Follow this transform specification:\n${transformSpec}\n\n`;
  }

  instructions += `Content to transform:
${content}

Return your result as JSON:
{
  "fragments": [
    {
      "content": "The transformed knowledge statement in English",
      "type": "FACT" | "QUESTION" | "ANSWER" | "DEFINITION" | "INSIGHT" | etc.
    }
  ],
  "source_language_detected": "detected language code"
}`;

  return instructions;
}

/**
 * Create a standard decode instruction
 */
export function createDecodeInstructions(
  content: string,
  targetLanguage: string,
  transformSpec: string | null
): string {
  let instructions = `Please translate/transform the following English knowledge fragment into ${targetLanguage}:

Fragment content:
${content}

`;

  if (transformSpec) {
    instructions += `Follow this transform specification for decoding:\n${transformSpec}\n\n`;
  }

  instructions += `Maintain the semantic meaning while adapting to natural ${targetLanguage} expression.

Return your result as JSON:
{
  "content": "The transformed content in ${targetLanguage}",
  "notes": "Any relevant notes about the transformation"
}`;

  return instructions;
}

/**
 * Create a tag suggestion instruction
 */
export function createTagSuggestionInstructions(maxSuggestions: number): string {
  return `Please analyze the content and suggest up to ${maxSuggestions} relevant tags from the existing tags list. If no suitable tags exist, suggest new tags to create. Return your suggestions in the format:

{
  "existing_tags": ["uuid1", "uuid2"], // UUIDs of existing tags that match
  "new_tags": [
    {"name": "tag-name", "category": "topic", "description": "..."}
  ]
}`;
}
