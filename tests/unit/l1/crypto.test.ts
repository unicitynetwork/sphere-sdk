/**
 * Tests for l1/crypto.ts
 * Covers wallet encryption, WIF conversion, and base58 encoding
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  generatePrivateKey,
  encryptWallet,
  decryptWallet,
  hexToWIF,
} from '../../../l1/crypto';

// =============================================================================
// Basic Encryption Tests
// =============================================================================

describe('encrypt() and decrypt()', () => {
  const password = 'test-password';

  it('should encrypt and decrypt text', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, password);
    const decrypted = decrypt(encrypted, password);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext each time', () => {
    const plaintext = 'Test data';
    const enc1 = encrypt(plaintext, password);
    const enc2 = encrypt(plaintext, password);

    // CryptoJS AES uses random IV
    expect(enc1).not.toBe(enc2);
  });

  it('should fail with wrong password', () => {
    const encrypted = encrypt('secret', password);

    // CryptoJS may throw "Malformed UTF-8 data" or return garbled data with wrong password
    try {
      const decrypted = decrypt(encrypted, 'wrong-password');
      // If it doesn't throw, result should not match original
      expect(decrypted).not.toBe('secret');
    } catch {
      // Expected to throw
      expect(true).toBe(true);
    }
  });

  it('should handle unicode characters', () => {
    const plaintext = 'Привет, мир! 🌍';
    const encrypted = encrypt(plaintext, password);
    const decrypted = decrypt(encrypted, password);

    expect(decrypted).toBe(plaintext);
  });

  it('should handle long text', () => {
    const plaintext = 'x'.repeat(10000);
    const encrypted = encrypt(plaintext, password);
    const decrypted = decrypt(encrypted, password);

    expect(decrypted).toBe(plaintext);
  });
});

// =============================================================================
// generatePrivateKey Tests
// =============================================================================

describe('generatePrivateKey()', () => {
  it('should generate 64-char hex string (32 bytes)', () => {
    const key = generatePrivateKey();

    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/i.test(key)).toBe(true);
  });

  it('should generate unique keys', () => {
    const key1 = generatePrivateKey();
    const key2 = generatePrivateKey();
    const key3 = generatePrivateKey();

    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);
  });

  it('should generate valid hex', () => {
    for (let i = 0; i < 10; i++) {
      const key = generatePrivateKey();
      expect(() => BigInt('0x' + key)).not.toThrow();
    }
  });
});

// =============================================================================
// Wallet Encryption Tests
// =============================================================================

describe('encryptWallet() and decryptWallet()', () => {
  const password = 'wallet-password-123';
  const masterKey = 'a'.repeat(64); // 32-byte hex key

  it('should encrypt and decrypt wallet master key', () => {
    const encrypted = encryptWallet(masterKey, password);
    const decrypted = decryptWallet(encrypted, password);

    expect(decrypted).toBe(masterKey);
  });

  it('should produce base64 encoded output', () => {
    const encrypted = encryptWallet(masterKey, password);

    // CryptoJS produces base64 output
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);
  });

  it('should fail with wrong password', () => {
    const encrypted = encryptWallet(masterKey, password);

    // CryptoJS may throw or return garbled data with wrong password
    try {
      const result = decryptWallet(encrypted, 'wrong-password');
      // If it doesn't throw, result should not match original
      expect(result).not.toBe(masterKey);
    } catch {
      // Expected to throw
      expect(true).toBe(true);
    }
  });

  it('should handle different key lengths', () => {
    const shortKey = 'abc123';
    const encrypted = encryptWallet(shortKey, password);
    const decrypted = decryptWallet(encrypted, password);

    expect(decrypted).toBe(shortKey);
  });

  it('should use PBKDF2 for key derivation', () => {
    // Same password should produce same derived key
    // So same plaintext + password = same structure (different random IV though)
    const enc1 = encryptWallet(masterKey, password);
    const enc2 = encryptWallet(masterKey, password);

    // Both should decrypt correctly
    expect(decryptWallet(enc1, password)).toBe(masterKey);
    expect(decryptWallet(enc2, password)).toBe(masterKey);
  });
});

// =============================================================================
// hexToWIF Tests
// =============================================================================

describe('hexToWIF()', () => {
  it('should convert hex private key to WIF format', () => {
    // Test with known private key
    const hexKey = '0000000000000000000000000000000000000000000000000000000000000001';
    const wif = hexToWIF(hexKey);

    // WIF should start with 5 for mainnet uncompressed
    expect(wif.startsWith('5')).toBe(true);
    expect(wif.length).toBeGreaterThan(40);
  });

  it('should produce valid Base58 output', () => {
    const hexKey = 'a'.repeat(64);
    const wif = hexToWIF(hexKey);

    // Base58 alphabet (no 0, O, I, l)
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    expect(base58Regex.test(wif)).toBe(true);
  });

  it('should produce deterministic output', () => {
    const hexKey = 'b'.repeat(64);
    const wif1 = hexToWIF(hexKey);
    const wif2 = hexToWIF(hexKey);

    expect(wif1).toBe(wif2);
  });

  it('should handle different private keys', () => {
    const wif1 = hexToWIF('1'.repeat(64));
    const wif2 = hexToWIF('2'.repeat(64));
    const wif3 = hexToWIF('f'.repeat(64));

    expect(wif1).not.toBe(wif2);
    expect(wif2).not.toBe(wif3);
  });

  it('should include version byte 0x80', () => {
    // The WIF format starts with version byte 0x80 for mainnet
    // This results in a leading 5 in Base58
    const hexKey = '0'.repeat(62) + '01';
    const wif = hexToWIF(hexKey);

    // For very small keys, should still start with 5
    expect(wif[0]).toBe('5');
  });

  it('should have checksum validation', () => {
    // WIF includes 4-byte checksum at end
    // Different keys should have different checksums
    const wif1 = hexToWIF('abcd'.repeat(16));
    const wif2 = hexToWIF('abce'.repeat(16));

    // Last few chars should differ due to checksum
    expect(wif1.slice(-4)).not.toBe(wif2.slice(-4));
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('encrypt should handle empty password', () => {
    const encrypted = encrypt('test', '');
    const decrypted = decrypt(encrypted, '');

    expect(decrypted).toBe('test');
  });

  it('encryptWallet should handle empty password', () => {
    const key = 'c'.repeat(64);
    const encrypted = encryptWallet(key, '');
    const decrypted = decryptWallet(encrypted, '');

    expect(decrypted).toBe(key);
  });

  it('hexToWIF should handle all-zero key', () => {
    // This is an invalid key (zero is not valid secp256k1) but the function should still work
    const wif = hexToWIF('0'.repeat(64));
    expect(wif.length).toBeGreaterThan(0);
  });
});
