/**
 * Tests for serialization/wallet-dat.ts
 * Covers wallet.dat format detection and parsing
 */

import { describe, it, expect } from 'vitest';
import {
  isSQLiteDatabase,
  isWalletDatEncrypted,
  parseWalletDat,
} from '../../../serialization/wallet-dat';

// =============================================================================
// Test Fixtures
// =============================================================================

// SQLite header: "SQLite format 3\0"
const SQLITE_HEADER = new TextEncoder().encode('SQLite format 3\0');

// mkey pattern indicates encrypted wallet
const MKEY_PATTERN = new TextEncoder().encode('mkey');

function createMockSQLiteData(encrypted = false): Uint8Array {
  const baseSize = 4096;
  const data = new Uint8Array(baseSize);

  // Set SQLite header
  data.set(SQLITE_HEADER, 0);

  // Add mkey pattern if encrypted
  if (encrypted) {
    data.set(MKEY_PATTERN, 100);
  }

  return data;
}

// =============================================================================
// isSQLiteDatabase Tests
// =============================================================================

describe('isSQLiteDatabase()', () => {
  it('should detect valid SQLite database', () => {
    const data = createMockSQLiteData();

    expect(isSQLiteDatabase(data)).toBe(true);
  });

  it('should reject non-SQLite data', () => {
    const data = new TextEncoder().encode('Not a SQLite database');

    expect(isSQLiteDatabase(data)).toBe(false);
  });

  it('should reject empty data', () => {
    const data = new Uint8Array(0);

    expect(isSQLiteDatabase(data)).toBe(false);
  });

  it('should reject data shorter than header', () => {
    const data = new Uint8Array(10);

    expect(isSQLiteDatabase(data)).toBe(false);
  });

  it('should reject partial SQLite header', () => {
    const data = new TextEncoder().encode('SQLite form');

    expect(isSQLiteDatabase(data)).toBe(false);
  });

  it('should accept data with SQLite header followed by binary', () => {
    const data = new Uint8Array(1000);
    data.set(SQLITE_HEADER, 0);
    // Fill rest with random bytes
    for (let i = SQLITE_HEADER.length; i < 1000; i++) {
      data[i] = Math.floor(Math.random() * 256);
    }

    expect(isSQLiteDatabase(data)).toBe(true);
  });
});

// =============================================================================
// isWalletDatEncrypted Tests
// =============================================================================

describe('isWalletDatEncrypted()', () => {
  it('should detect encrypted wallet (has mkey)', () => {
    const data = createMockSQLiteData(true);

    expect(isWalletDatEncrypted(data)).toBe(true);
  });

  it('should detect unencrypted wallet (no mkey)', () => {
    const data = createMockSQLiteData(false);

    expect(isWalletDatEncrypted(data)).toBe(false);
  });

  it('should find mkey anywhere in file', () => {
    const data = new Uint8Array(10000);
    data.set(MKEY_PATTERN, 5000); // mkey in the middle

    expect(isWalletDatEncrypted(data)).toBe(true);
  });

  it('should return false for empty data', () => {
    const data = new Uint8Array(0);

    expect(isWalletDatEncrypted(data)).toBe(false);
  });
});

// =============================================================================
// parseWalletDat Tests
// =============================================================================

describe('parseWalletDat()', () => {
  it('should fail for non-SQLite data', () => {
    const data = new TextEncoder().encode('Not a wallet');

    const result = parseWalletDat(data);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not an SQLite database');
  });

  it('should require password for encrypted wallet', () => {
    // Create minimal encrypted wallet mock
    const data = new Uint8Array(4096);
    data.set(SQLITE_HEADER, 0);
    data.set(MKEY_PATTERN, 100);

    // Add CMasterKey-like structure
    // Format: 0x30 + 48 bytes encrypted + 0x08 + 8 bytes salt + 4 bytes method + 4 bytes iterations
    const cmkPos = 200;
    data[cmkPos] = 0x30; // Start marker
    data[cmkPos + 1 + 48] = 0x08; // Salt length marker
    // Set iterations (little-endian 25000)
    const iterPos = cmkPos + 1 + 48 + 1 + 8 + 4;
    data[iterPos] = 0xa8; // 25000 & 0xff
    data[iterPos + 1] = 0x61; // (25000 >> 8) & 0xff
    data[iterPos + 2] = 0x00;
    data[iterPos + 3] = 0x00;

    const result = parseWalletDat(data);

    expect(result.success).toBe(false);
    expect(result.needsPassword).toBe(true);
  });

  it('should fail for encrypted wallet without CMasterKey', () => {
    const data = new Uint8Array(1000);
    data.set(SQLITE_HEADER, 0);
    data.set(MKEY_PATTERN, 100);
    // No CMasterKey structure

    const result = parseWalletDat(data);

    expect(result.success).toBe(false);
    expect(result.error).toContain('no CMasterKey');
  });

  it('should fail for unencrypted wallet without keys', () => {
    const data = createMockSQLiteData(false);

    const result = parseWalletDat(data);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid private keys');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  it('should handle exact header length', () => {
    const data = new Uint8Array(16);
    data.set(SQLITE_HEADER, 0);

    expect(isSQLiteDatabase(data)).toBe(true);
  });

  it('should be case-sensitive for SQLite header', () => {
    const data = new TextEncoder().encode('sqlite format 3\0'); // lowercase

    expect(isSQLiteDatabase(data)).toBe(false);
  });

  it('should detect mkey as substring', () => {
    const data = new TextEncoder().encode('prefix_mkey_suffix');

    expect(isWalletDatEncrypted(data)).toBe(true);
  });

  it('should handle large files', () => {
    const largeData = new Uint8Array(10 * 1024 * 1024); // 10MB
    largeData.set(SQLITE_HEADER, 0);
    largeData.set(MKEY_PATTERN, 5 * 1024 * 1024); // mkey in middle

    expect(isSQLiteDatabase(largeData)).toBe(true);
    expect(isWalletDatEncrypted(largeData)).toBe(true);
  });
});
