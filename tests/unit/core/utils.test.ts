/**
 * Tests for core/utils.ts
 * Covers utility functions like Base58, pattern search, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidPrivateKey,
  base58Encode,
  base58Decode,
  findPattern,
  extractFromText,
  sleep,
  randomHex,
  randomUUID,
} from '../../../core/utils';

import { BASE58_VECTORS, PRIVATE_KEY_VECTORS } from '../../fixtures/test-vectors';

// =============================================================================
// Private Key Validation Tests
// =============================================================================

describe('isValidPrivateKey()', () => {
  it('should return true for valid private keys', () => {
    for (const key of PRIVATE_KEY_VECTORS.valid) {
      expect(isValidPrivateKey(key)).toBe(true);
    }
  });

  it('should return false for invalid private keys', () => {
    for (const key of PRIVATE_KEY_VECTORS.invalid) {
      expect(isValidPrivateKey(key)).toBe(false);
    }
  });

  it('should return false for non-hex strings', () => {
    expect(isValidPrivateKey('not a hex string')).toBe(false);
    expect(isValidPrivateKey('GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(
      false
    );
  });

  it('should return false for wrong length', () => {
    expect(isValidPrivateKey('abc')).toBe(false);
    expect(isValidPrivateKey('abc'.repeat(100))).toBe(false);
  });

  it('should be case-insensitive', () => {
    const lower = 'e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35';
    const upper = 'E8F32E723DECF4051AEFAC8E2C93C9C5B214313817CDB01A1494B917C8436B35';
    expect(isValidPrivateKey(lower)).toBe(true);
    expect(isValidPrivateKey(upper)).toBe(true);
  });
});

// =============================================================================
// Base58 Encoding Tests
// =============================================================================

describe('base58Encode()', () => {
  it('should encode hex to Base58', () => {
    for (const vector of BASE58_VECTORS) {
      expect(base58Encode(vector.hex)).toBe(vector.base58);
    }
  });

  it('should handle leading zeros (as "1"s)', () => {
    expect(base58Encode('00')).toBe('1');
    expect(base58Encode('0000')).toBe('11');
  });

  it('should encode arbitrary hex data', () => {
    // Note: This is raw Base58 encoding WITHOUT checksum
    // Bitcoin addresses add a 4-byte checksum before encoding
    const hex = 'deadbeef';
    const result = base58Encode(hex);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Verify round-trip
    const decoded = base58Decode(result);
    const decodedHex = Array.from(decoded)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(decodedHex).toBe(hex);
  });
});

// =============================================================================
// Base58 Decoding Tests
// =============================================================================

describe('base58Decode()', () => {
  it('should decode Base58 to bytes', () => {
    for (const vector of BASE58_VECTORS) {
      const decoded = base58Decode(vector.base58);
      const hex = Array.from(decoded)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(hex).toBe(vector.hex);
    }
  });

  it('should handle leading "1"s (as zeros)', () => {
    const decoded = base58Decode('1');
    expect(decoded).toEqual(new Uint8Array([0]));

    const decoded2 = base58Decode('11');
    expect(decoded2).toEqual(new Uint8Array([0, 0]));
  });

  it('should throw for invalid characters', () => {
    expect(() => base58Decode('0OIl')).toThrow('Invalid base58 character');
  });
});

// =============================================================================
// Base58 Round-trip Tests
// =============================================================================

describe('Base58 Round-trip', () => {
  it('should round-trip various values', () => {
    const testHexValues = [
      'deadbeef',
      '00deadbeef',
      '0000deadbeef',
      'ff'.repeat(32),
      '00'.repeat(10),
    ];

    for (const hex of testHexValues) {
      const encoded = base58Encode(hex);
      const decoded = base58Decode(encoded);
      const recoveredHex = Array.from(decoded)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(recoveredHex).toBe(hex);
    }
  });
});

// =============================================================================
// Pattern Search Tests
// =============================================================================

describe('findPattern()', () => {
  it('should find pattern in data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const pattern = new Uint8Array([4, 5, 6]);
    expect(findPattern(data, pattern)).toBe(3);
  });

  it('should return -1 if pattern not found', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const pattern = new Uint8Array([6, 7, 8]);
    expect(findPattern(data, pattern)).toBe(-1);
  });

  it('should find pattern at start', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const pattern = new Uint8Array([1, 2]);
    expect(findPattern(data, pattern)).toBe(0);
  });

  it('should find pattern at end', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const pattern = new Uint8Array([4, 5]);
    expect(findPattern(data, pattern)).toBe(3);
  });

  it('should respect startIndex', () => {
    const data = new Uint8Array([1, 2, 1, 2, 3]);
    const pattern = new Uint8Array([1, 2]);
    expect(findPattern(data, pattern, 0)).toBe(0);
    expect(findPattern(data, pattern, 1)).toBe(2);
  });

  it('should handle single-byte pattern', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const pattern = new Uint8Array([3]);
    expect(findPattern(data, pattern)).toBe(2);
  });

  it('should handle empty pattern', () => {
    const data = new Uint8Array([1, 2, 3]);
    const pattern = new Uint8Array([]);
    expect(findPattern(data, pattern)).toBe(0);
  });

  it('should handle pattern longer than data', () => {
    const data = new Uint8Array([1, 2]);
    const pattern = new Uint8Array([1, 2, 3]);
    expect(findPattern(data, pattern)).toBe(-1);
  });
});

// =============================================================================
// Text Extraction Tests
// =============================================================================

describe('extractFromText()', () => {
  it('should extract value using regex', () => {
    const text = 'Master Key: abc123def';
    const result = extractFromText(text, /Master Key:\s*(\w+)/);
    expect(result).toBe('abc123def');
  });

  it('should return null if no match', () => {
    const text = 'No key here';
    const result = extractFromText(text, /Master Key:\s*(\w+)/);
    expect(result).toBeNull();
  });

  it('should trim whitespace', () => {
    const text = 'Key:   value   ';
    const result = extractFromText(text, /Key:\s*(.+)/);
    expect(result).toBe('value');
  });

  it('should handle multiline text', () => {
    const text = `
      Some text
      Address: alpha1abc123
      More text
    `;
    const result = extractFromText(text, /Address:\s*(\S+)/);
    expect(result).toBe('alpha1abc123');
  });

  it('should return first capture group', () => {
    const text = 'Name: John, Age: 30';
    const result = extractFromText(text, /Name: (\w+)/);
    expect(result).toBe('John');
  });
});

// =============================================================================
// Sleep Tests
// =============================================================================

describe('sleep()', () => {
  it('should delay for specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    // Allow some tolerance for timing
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(150);
  });

  it('should return a promise', () => {
    const result = sleep(1);
    expect(result).toBeInstanceOf(Promise);
  });

  it('should work with 0ms', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// =============================================================================
// Random Generation Tests
// =============================================================================

describe('randomHex()', () => {
  it('should generate hex string of specified byte length', () => {
    const hex16 = randomHex(16);
    expect(hex16).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(/^[0-9a-f]+$/.test(hex16)).toBe(true);

    const hex32 = randomHex(32);
    expect(hex32).toHaveLength(64);
  });

  it('should generate unique values', () => {
    const values = new Set();
    for (let i = 0; i < 100; i++) {
      values.add(randomHex(16));
    }
    expect(values.size).toBe(100);
  });
});

describe('randomUUID()', () => {
  it('should generate valid UUID v4 format', () => {
    const uuid = randomUUID();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(uuid)).toBe(true);
  });

  it('should generate unique values', () => {
    const values = new Set();
    for (let i = 0; i < 100; i++) {
      values.add(randomUUID());
    }
    expect(values.size).toBe(100);
  });
});
