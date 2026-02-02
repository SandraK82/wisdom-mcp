import * as ed from '@noble/ed25519';
import { WisdomConfig } from '../config/schema.js';

/**
 * Key pair for Ed25519 signing
 */
export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  privateKeyBase64: string;
  publicKeyBase64: string;
}

/**
 * Encode bytes to Base64
 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Decode Base64 to bytes
 */
export function fromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Generate a new Ed25519 key pair
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Generate random 32-byte private key
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  return {
    privateKey,
    publicKey,
    privateKeyBase64: toBase64(privateKey),
    publicKeyBase64: toBase64(publicKey),
  };
}

/**
 * Get public key from private key
 */
export async function getPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  return await ed.getPublicKeyAsync(privateKey);
}

/**
 * Key manager for the current agent
 */
export class KeyManager {
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;

  constructor(config: WisdomConfig) {
    this.setConfig(config);
  }

  /**
   * Update keys from config
   */
  setConfig(config: WisdomConfig): void {
    if (config.private_key) {
      try {
        this.privateKey = fromBase64(config.private_key);
      } catch {
        this.privateKey = null;
      }
    } else {
      this.privateKey = null;
    }
    // Public key will be derived on demand
    this.publicKey = null;
  }

  /**
   * Check if a private key is loaded
   */
  hasPrivateKey(): boolean {
    return this.privateKey !== null;
  }

  /**
   * Get the private key or throw if not configured
   */
  getPrivateKey(): Uint8Array {
    if (!this.privateKey) {
      throw new Error(
        'No private key configured. Run wisdom_generate_keypair first.'
      );
    }
    return this.privateKey;
  }

  /**
   * Get the public key (derived from private key)
   */
  async getPublicKey(): Promise<Uint8Array> {
    if (!this.publicKey) {
      const privateKey = this.getPrivateKey();
      this.publicKey = await getPublicKey(privateKey);
    }
    return this.publicKey;
  }

  /**
   * Get public key as Base64 string
   */
  async getPublicKeyBase64(): Promise<string> {
    const publicKey = await this.getPublicKey();
    return toBase64(publicKey);
  }
}
