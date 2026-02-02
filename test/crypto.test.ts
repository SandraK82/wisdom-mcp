import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  toBase64,
  fromBase64,
} from '../src/crypto/keys.js';
import {
  sign,
  verify,
  signFragment,
  getFragmentSignablePayload,
} from '../src/crypto/signing.js';

describe('Key Generation', () => {
  it('should generate a valid keypair', async () => {
    const keypair = await generateKeyPair();

    expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.privateKey.length).toBe(32);
    expect(keypair.publicKey.length).toBe(32);
    expect(keypair.privateKeyBase64).toBeTruthy();
    expect(keypair.publicKeyBase64).toBeTruthy();
  });

  it('should generate unique keypairs', async () => {
    const keypair1 = await generateKeyPair();
    const keypair2 = await generateKeyPair();

    expect(keypair1.privateKeyBase64).not.toBe(keypair2.privateKeyBase64);
    expect(keypair1.publicKeyBase64).not.toBe(keypair2.publicKeyBase64);
  });
});

describe('Base64 Encoding', () => {
  it('should roundtrip bytes through base64', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);

    expect(decoded).toEqual(original);
  });
});

describe('Signing', () => {
  it('should sign and verify a message', async () => {
    const keypair = await generateKeyPair();
    const message = 'Hello, World!';

    const signature = await sign(message, keypair.privateKey);
    const isValid = await verify(message, signature, keypair.publicKey);

    expect(isValid).toBe(true);
  });

  it('should reject invalid signatures', async () => {
    const keypair1 = await generateKeyPair();
    const keypair2 = await generateKeyPair();
    const message = 'Hello, World!';

    const signature = await sign(message, keypair1.privateKey);
    // Verify with wrong public key
    const isValid = await verify(message, signature, keypair2.publicKey);

    expect(isValid).toBe(false);
  });

  it('should reject tampered messages', async () => {
    const keypair = await generateKeyPair();
    const message = 'Hello, World!';

    const signature = await sign(message, keypair.privateKey);
    const isValid = await verify('Tampered message', signature, keypair.publicKey);

    expect(isValid).toBe(false);
  });
});

describe('Fragment Signing', () => {
  it('should create deterministic signable payload', () => {
    const fragment1 = {
      uuid: 'test-uuid',
      content: 'Test content',
      language: 'en',
      author: 'author-uuid',
      project: null,
      source_transform: null,
    };

    const fragment2 = {
      // Same data, different order
      language: 'en',
      uuid: 'test-uuid',
      author: 'author-uuid',
      content: 'Test content',
      source_transform: null,
      project: null,
    };

    const payload1 = getFragmentSignablePayload(fragment1);
    const payload2 = getFragmentSignablePayload(fragment2);

    expect(payload1).toBe(payload2);
  });

  it('should sign and verify a fragment', async () => {
    const keypair = await generateKeyPair();
    const fragment = {
      uuid: 'test-uuid',
      content: 'Test content',
      language: 'en',
      author: 'author-uuid',
      project: null,
      source_transform: null,
    };

    const signature = await signFragment(fragment, keypair.privateKey);
    const payload = getFragmentSignablePayload(fragment);
    const isValid = await verify(payload, signature, keypair.publicKey);

    expect(isValid).toBe(true);
  });
});
