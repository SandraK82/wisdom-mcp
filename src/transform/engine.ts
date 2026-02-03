import type { GatewayClient } from '../gateway/client.js';
import type { Transform } from '../gateway/types.js';
import {
  type TransformDelegationRequest,
  createEncodeInstructions,
  createDecodeInstructions,
} from './delegation.js';

/**
 * Transform engine that orchestrates transformations via host delegation
 */
export class TransformEngine {
  private gateway: GatewayClient;

  constructor(gateway: GatewayClient) {
    this.gateway = gateway;
  }

  /**
   * Find a transform by domain or use default
   */
  async findTransform(domain?: string, transformUuid?: string): Promise<Transform | null> {
    // If specific transform requested, use it
    if (transformUuid) {
      try {
        return await this.gateway.getTransform(transformUuid);
      } catch {
        return null;
      }
    }

    // Search by domain
    if (domain && domain !== 'general') {
      try {
        const transforms = await this.gateway.listTransforms(domain, 1);
        if (transforms.items.length > 0) {
          return transforms.items[0];
        }
      } catch {
        // No transforms found
      }
    }

    return null;
  }

  /**
   * Create an encode (content → fragments) delegation request
   */
  async createEncodeRequest(
    content: string,
    options: {
      sourceLanguage?: string;
      domain?: string;
      transformUuid?: string;
    } = {}
  ): Promise<TransformDelegationRequest> {
    const transform = await this.findTransform(options.domain, options.transformUuid);
    const transformSpec = transform?.additional_data || null;

    return {
      action: 'transform_request',
      direction: 'encode',
      input: content,
      source_language: options.sourceLanguage || 'auto',
      target_language: 'en',
      domain: options.domain || 'general',
      transform_spec: transformSpec,
      instructions: createEncodeInstructions(content, transformSpec),
    };
  }

  /**
   * Create a decode (fragment → target language) delegation request
   */
  async createDecodeRequest(
    fragmentContent: string,
    targetLanguage: string,
    options: {
      sourceTransformUuid?: string;
      transformUuid?: string;
    } = {}
  ): Promise<TransformDelegationRequest> {
    // Try to use the original transform, or a specified one
    const transformUuid = options.transformUuid || options.sourceTransformUuid;
    const transform = transformUuid
      ? await this.findTransform(undefined, transformUuid)
      : null;
    const transformSpec = transform?.additional_data || null;

    return {
      action: 'transform_request',
      direction: 'decode',
      input: fragmentContent,
      source_language: 'en',
      target_language: targetLanguage,
      transform_spec: transformSpec,
      instructions: createDecodeInstructions(fragmentContent, targetLanguage, transformSpec),
    };
  }
}
