/**
 * Tests for l1/addressHelpers.ts
 * Covers WalletAddressHelper utility class for address management
 */

import { describe, it, expect } from 'vitest';
import { WalletAddressHelper } from '../../../l1/addressHelpers';
import type { Wallet, WalletAddress } from '../../../l1/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestWallet(addresses: WalletAddress[] = []): Wallet {
  return {
    masterPrivateKey: 'a'.repeat(64),
    chainCode: 'b'.repeat(64),
    addresses,
  };
}

function createTestAddress(overrides: Partial<WalletAddress> = {}): WalletAddress {
  return {
    address: 'alpha1test' + Math.random().toString(36).slice(2, 8),
    privateKey: 'c'.repeat(64),
    publicKey: '02' + 'd'.repeat(64),
    path: "m/84'/1'/0'/0/0",
    index: 0,
    isChange: false,
    ...overrides,
  };
}

// =============================================================================
// findByPath Tests
// =============================================================================

describe('WalletAddressHelper.findByPath()', () => {
  it('should find address by path', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/5" });
    const wallet = createTestWallet([addr]);

    const found = WalletAddressHelper.findByPath(wallet, "m/84'/1'/0'/0/5");

    expect(found).toBe(addr);
  });

  it('should return undefined for non-existent path', () => {
    const wallet = createTestWallet([createTestAddress()]);

    const found = WalletAddressHelper.findByPath(wallet, "m/84'/1'/0'/0/99");

    expect(found).toBeUndefined();
  });

  it('should return undefined for empty wallet', () => {
    const wallet = createTestWallet([]);

    const found = WalletAddressHelper.findByPath(wallet, "m/84'/1'/0'/0/0");

    expect(found).toBeUndefined();
  });

  it('should find among multiple addresses', () => {
    const addr1 = createTestAddress({ path: "m/84'/1'/0'/0/0", index: 0 });
    const addr2 = createTestAddress({ path: "m/84'/1'/0'/0/1", index: 1 });
    const addr3 = createTestAddress({ path: "m/84'/1'/0'/0/2", index: 2 });
    const wallet = createTestWallet([addr1, addr2, addr3]);

    const found = WalletAddressHelper.findByPath(wallet, "m/84'/1'/0'/0/1");

    expect(found).toBe(addr2);
  });
});

// =============================================================================
// getDefault Tests
// =============================================================================

describe('WalletAddressHelper.getDefault()', () => {
  it('should return first non-change address', () => {
    const external = createTestAddress({ isChange: false, index: 0 });
    const change = createTestAddress({ isChange: true, index: 0 });
    const wallet = createTestWallet([change, external]);

    const result = WalletAddressHelper.getDefault(wallet);

    expect(result).toBe(external);
  });

  it('should return first address if all are change', () => {
    const change1 = createTestAddress({ isChange: true, index: 0 });
    const change2 = createTestAddress({ isChange: true, index: 1 });
    const wallet = createTestWallet([change1, change2]);

    const result = WalletAddressHelper.getDefault(wallet);

    expect(result).toBe(change1);
  });

  it('should return first address by default', () => {
    const addr = createTestAddress();
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.getDefault(wallet);

    expect(result).toBe(addr);
  });
});

// =============================================================================
// getDefaultOrNull Tests
// =============================================================================

describe('WalletAddressHelper.getDefaultOrNull()', () => {
  it('should return undefined for empty wallet', () => {
    const wallet = createTestWallet([]);

    const result = WalletAddressHelper.getDefaultOrNull(wallet);

    expect(result).toBeUndefined();
  });

  it('should return undefined for wallet with null addresses', () => {
    const wallet = { masterPrivateKey: 'a'.repeat(64), addresses: null } as unknown as Wallet;

    const result = WalletAddressHelper.getDefaultOrNull(wallet);

    expect(result).toBeUndefined();
  });

  it('should return first non-change address', () => {
    const external = createTestAddress({ isChange: false });
    const wallet = createTestWallet([external]);

    const result = WalletAddressHelper.getDefaultOrNull(wallet);

    expect(result).toBe(external);
  });
});

// =============================================================================
// add Tests
// =============================================================================

describe('WalletAddressHelper.add()', () => {
  it('should add new address to wallet', () => {
    const wallet = createTestWallet([]);
    const newAddr = createTestAddress({ path: "m/84'/1'/0'/0/0" });

    const result = WalletAddressHelper.add(wallet, newAddr);

    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toBe(newAddr);
  });

  it('should return new wallet object (immutable)', () => {
    const wallet = createTestWallet([]);
    const newAddr = createTestAddress({ path: "m/84'/1'/0'/0/0" });

    const result = WalletAddressHelper.add(wallet, newAddr);

    expect(result).not.toBe(wallet);
    expect(result.addresses).not.toBe(wallet.addresses);
  });

  it('should throw if address has no path', () => {
    const wallet = createTestWallet([]);
    const newAddr = createTestAddress({ path: undefined });

    expect(() => WalletAddressHelper.add(wallet, newAddr)).toThrow('Cannot add address without a path');
  });

  it('should be idempotent for same path and address', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/0", address: 'alpha1same' });
    const wallet = createTestWallet([addr]);
    const sameAddr = { ...addr }; // Same path and address

    const result = WalletAddressHelper.add(wallet, sameAddr);

    expect(result).toBe(wallet); // Returns unchanged wallet
    expect(result.addresses).toHaveLength(1);
  });

  it('should throw if path exists with different address', () => {
    const existingAddr = createTestAddress({ path: "m/84'/1'/0'/0/0", address: 'alpha1existing' });
    const wallet = createTestWallet([existingAddr]);
    const conflictingAddr = createTestAddress({ path: "m/84'/1'/0'/0/0", address: 'alpha1different' });

    expect(() => WalletAddressHelper.add(wallet, conflictingAddr)).toThrow('CRITICAL');
  });

  it('should add multiple addresses with different paths', () => {
    let wallet = createTestWallet([]);
    const addr1 = createTestAddress({ path: "m/84'/1'/0'/0/0", index: 0 });
    const addr2 = createTestAddress({ path: "m/84'/1'/0'/0/1", index: 1 });

    wallet = WalletAddressHelper.add(wallet, addr1);
    wallet = WalletAddressHelper.add(wallet, addr2);

    expect(wallet.addresses).toHaveLength(2);
  });
});

// =============================================================================
// removeByPath Tests
// =============================================================================

describe('WalletAddressHelper.removeByPath()', () => {
  it('should remove address by path', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/0" });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.removeByPath(wallet, "m/84'/1'/0'/0/0");

    expect(result.addresses).toHaveLength(0);
  });

  it('should return new wallet object (immutable)', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/0" });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.removeByPath(wallet, "m/84'/1'/0'/0/0");

    expect(result).not.toBe(wallet);
  });

  it('should not modify wallet if path not found', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/0" });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.removeByPath(wallet, "m/84'/1'/0'/0/99");

    expect(result.addresses).toHaveLength(1);
  });

  it('should only remove matching path', () => {
    const addr1 = createTestAddress({ path: "m/84'/1'/0'/0/0", index: 0 });
    const addr2 = createTestAddress({ path: "m/84'/1'/0'/0/1", index: 1 });
    const wallet = createTestWallet([addr1, addr2]);

    const result = WalletAddressHelper.removeByPath(wallet, "m/84'/1'/0'/0/0");

    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toBe(addr2);
  });
});

// =============================================================================
// getExternal Tests
// =============================================================================

describe('WalletAddressHelper.getExternal()', () => {
  it('should return only external addresses', () => {
    const external1 = createTestAddress({ isChange: false, index: 0 });
    const external2 = createTestAddress({ isChange: false, index: 1 });
    const change = createTestAddress({ isChange: true, index: 0 });
    const wallet = createTestWallet([external1, change, external2]);

    const result = WalletAddressHelper.getExternal(wallet);

    expect(result).toHaveLength(2);
    expect(result).toContain(external1);
    expect(result).toContain(external2);
    expect(result).not.toContain(change);
  });

  it('should return empty array if no external addresses', () => {
    const change = createTestAddress({ isChange: true });
    const wallet = createTestWallet([change]);

    const result = WalletAddressHelper.getExternal(wallet);

    expect(result).toHaveLength(0);
  });

  it('should treat undefined isChange as external', () => {
    const addr = createTestAddress({ isChange: undefined });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.getExternal(wallet);

    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// getChange Tests
// =============================================================================

describe('WalletAddressHelper.getChange()', () => {
  it('should return only change addresses', () => {
    const external = createTestAddress({ isChange: false });
    const change1 = createTestAddress({ isChange: true, index: 0 });
    const change2 = createTestAddress({ isChange: true, index: 1 });
    const wallet = createTestWallet([external, change1, change2]);

    const result = WalletAddressHelper.getChange(wallet);

    expect(result).toHaveLength(2);
    expect(result).toContain(change1);
    expect(result).toContain(change2);
    expect(result).not.toContain(external);
  });

  it('should return empty array if no change addresses', () => {
    const external = createTestAddress({ isChange: false });
    const wallet = createTestWallet([external]);

    const result = WalletAddressHelper.getChange(wallet);

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// hasPath Tests
// =============================================================================

describe('WalletAddressHelper.hasPath()', () => {
  it('should return true if path exists', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/5" });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.hasPath(wallet, "m/84'/1'/0'/0/5");

    expect(result).toBe(true);
  });

  it('should return false if path does not exist', () => {
    const addr = createTestAddress({ path: "m/84'/1'/0'/0/0" });
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.hasPath(wallet, "m/84'/1'/0'/0/99");

    expect(result).toBe(false);
  });

  it('should return false for empty wallet', () => {
    const wallet = createTestWallet([]);

    const result = WalletAddressHelper.hasPath(wallet, "m/84'/1'/0'/0/0");

    expect(result).toBe(false);
  });
});

// =============================================================================
// validate Tests
// =============================================================================

describe('WalletAddressHelper.validate()', () => {
  it('should pass for valid wallet', () => {
    const addr1 = createTestAddress({ path: "m/84'/1'/0'/0/0" });
    const addr2 = createTestAddress({ path: "m/84'/1'/0'/0/1" });
    const wallet = createTestWallet([addr1, addr2]);

    expect(() => WalletAddressHelper.validate(wallet)).not.toThrow();
  });

  it('should pass for empty wallet', () => {
    const wallet = createTestWallet([]);

    expect(() => WalletAddressHelper.validate(wallet)).not.toThrow();
  });

  it('should throw for duplicate paths', () => {
    const addr1 = createTestAddress({ path: "m/84'/1'/0'/0/0", address: 'alpha1first' });
    const addr2 = createTestAddress({ path: "m/84'/1'/0'/0/0", address: 'alpha1second' });
    const wallet = createTestWallet([addr1, addr2]);

    expect(() => WalletAddressHelper.validate(wallet)).toThrow('CRITICAL');
    expect(() => WalletAddressHelper.validate(wallet)).toThrow('duplicate paths');
  });

  it('should ignore addresses without paths', () => {
    const addr1 = createTestAddress({ path: undefined });
    const addr2 = createTestAddress({ path: undefined });
    const wallet = createTestWallet([addr1, addr2]);

    // Addresses without paths are filtered out, so no duplicates
    expect(() => WalletAddressHelper.validate(wallet)).not.toThrow();
  });
});

// =============================================================================
// sortAddresses Tests
// =============================================================================

describe('WalletAddressHelper.sortAddresses()', () => {
  it('should sort external addresses before change addresses', () => {
    const change = createTestAddress({ isChange: true, index: 0 });
    const external = createTestAddress({ isChange: false, index: 0 });
    const wallet = createTestWallet([change, external]);

    const result = WalletAddressHelper.sortAddresses(wallet);

    expect(result.addresses[0]).toBe(external);
    expect(result.addresses[1]).toBe(change);
  });

  it('should sort by index within each group', () => {
    const ext2 = createTestAddress({ isChange: false, index: 2 });
    const ext0 = createTestAddress({ isChange: false, index: 0 });
    const ext1 = createTestAddress({ isChange: false, index: 1 });
    const wallet = createTestWallet([ext2, ext0, ext1]);

    const result = WalletAddressHelper.sortAddresses(wallet);

    expect(result.addresses[0]).toBe(ext0);
    expect(result.addresses[1]).toBe(ext1);
    expect(result.addresses[2]).toBe(ext2);
  });

  it('should return new wallet object (immutable)', () => {
    const addr = createTestAddress();
    const wallet = createTestWallet([addr]);

    const result = WalletAddressHelper.sortAddresses(wallet);

    expect(result).not.toBe(wallet);
    expect(result.addresses).not.toBe(wallet.addresses);
  });

  it('should handle mixed addresses correctly', () => {
    const change1 = createTestAddress({ isChange: true, index: 1 });
    const change0 = createTestAddress({ isChange: true, index: 0 });
    const ext1 = createTestAddress({ isChange: false, index: 1 });
    const ext0 = createTestAddress({ isChange: false, index: 0 });
    const wallet = createTestWallet([change1, ext1, change0, ext0]);

    const result = WalletAddressHelper.sortAddresses(wallet);

    // External first, sorted by index
    expect(result.addresses[0]).toBe(ext0);
    expect(result.addresses[1]).toBe(ext1);
    // Then change, sorted by index
    expect(result.addresses[2]).toBe(change0);
    expect(result.addresses[3]).toBe(change1);
  });
});
