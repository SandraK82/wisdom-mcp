import { describe, it, expect } from 'vitest';
import {
  WisdomConfigSchema,
  PartialWisdomConfigSchema,
  DEFAULT_CONFIG,
} from '../src/config/schema.js';

describe('Config Schema', () => {
  it('should validate a minimal config', () => {
    const result = WisdomConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway_url).toBe('http://localhost:8080');
    }
  });

  it('should validate a full config', () => {
    const config = {
      agent_uuid: '123e4567-e89b-12d3-a456-426614174000',
      private_key: 'dGVzdC1wcml2YXRlLWtleQ==',
      gateway_url: 'http://example.com:8080',
      current_project: '123e4567-e89b-12d3-a456-426614174001',
      default_tags: ['123e4567-e89b-12d3-a456-426614174002'],
      default_transform: '123e4567-e89b-12d3-a456-426614174003',
    };

    const result = WisdomConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent_uuid).toBe(config.agent_uuid);
      expect(result.data.gateway_url).toBe(config.gateway_url);
    }
  });

  it('should reject invalid UUIDs', () => {
    const config = {
      agent_uuid: 'not-a-uuid',
    };

    const result = WisdomConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid URLs', () => {
    const config = {
      gateway_url: 'not-a-url',
    };

    const result = WisdomConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('Partial Config Schema', () => {
  it('should allow all fields to be optional', () => {
    const partial = {};
    const result = PartialWisdomConfigSchema.safeParse(partial);

    expect(result.success).toBe(true);
  });

  it('should validate partial configs', () => {
    const partial = {
      gateway_url: 'http://other.com:8080',
    };
    const result = PartialWisdomConfigSchema.safeParse(partial);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway_url).toBe(partial.gateway_url);
    }
  });
});

describe('Default Config', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_CONFIG.gateway_url).toBe('http://localhost:8080');
  });
});
