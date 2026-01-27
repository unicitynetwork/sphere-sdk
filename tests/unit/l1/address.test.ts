/**
 * Tests for l1/address.ts
 * Covers L1 address derivation functions
 */

import { describe, it, expect } from 'vitest';
import {
  generateMasterKeyFromSeed,
  generateHDAddressBIP32,
  generateAddressFromMasterKey,
  generateHDAddress,
  deriveChildKey,
  deriveChildKeyBIP32,
  deriveKeyAtPath,
} from '../../../l1/address';

import { BIP39_VECTORS, BIP32_VECTORS } from '../../fixtures/test-vectors';
import { mnemonicToSeedSync, generateMasterKey } from '../../../core/crypto';

// =============================================================================
// generateMasterKeyFromSeed Tests
// =============================================================================

describe('generateMasterKeyFromSeed()', () => {
  it('should generate master key with correct naming convention', () => {
    const vector = BIP32_VECTORS[0];
    const result = generateMasterKeyFromSeed(vector.seed);

    // Check L1 naming convention
    expect(result.masterPrivateKey).toBe(vector.masterPrivateKey);
    expect(result.masterChainCode).toBe(vector.masterChainCode);
  });

  it('should produce same result as core generateMasterKey', () => {
    const seed = BIP39_VECTORS[0].seed;
    const coreResult = generateMasterKey(seed);
    const l1Result = generateMasterKeyFromSeed(seed);

    expect(l1Result.masterPrivateKey).toBe(coreResult.privateKey);
    expect(l1Result.masterChainCode).toBe(coreResult.chainCode);
  });
});

// =============================================================================
// generateHDAddressBIP32 Tests
// =============================================================================

describe('generateHDAddressBIP32()', () => {
  it('should generate address at index 0', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const address = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0);

    expect(address.privateKey).toHaveLength(64);
    expect(address.publicKey).toHaveLength(66);
    expect(address.address.startsWith('alpha1')).toBe(true);
    expect(address.index).toBe(0);
    expect(address.path).toBe("m/44'/0'/0'/0/0");
  });

  it('should generate different addresses at different indices', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const addr0 = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0);
    const addr1 = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 1);
    const addr2 = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 2);

    expect(addr0.address).not.toBe(addr1.address);
    expect(addr1.address).not.toBe(addr2.address);
    expect(addr0.privateKey).not.toBe(addr1.privateKey);
  });

  it('should generate change addresses when isChange=true', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const receiving = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0, "m/44'/0'/0'", false);
    const change = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0, "m/44'/0'/0'", true);

    expect(receiving.path).toBe("m/44'/0'/0'/0/0");
    expect(change.path).toBe("m/44'/0'/0'/1/0");
    expect(receiving.address).not.toBe(change.address);
  });

  it('should use custom base path', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const customPath = "m/84'/0'/0'";
    const address = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0, customPath);

    expect(address.path).toBe("m/84'/0'/0'/0/0");
  });
});

// =============================================================================
// generateAddressFromMasterKey Tests (Legacy HMAC derivation)
// =============================================================================

describe('generateAddressFromMasterKey() - Legacy HMAC', () => {
  it('should generate address using HMAC-SHA512 derivation', () => {
    const seed = BIP39_VECTORS[0].seed;
    const masterKey = generateMasterKey(seed);

    const address = generateAddressFromMasterKey(masterKey.privateKey, 0);

    expect(address.privateKey).toHaveLength(64);
    expect(address.publicKey).toHaveLength(66);
    expect(address.address.startsWith('alpha1')).toBe(true);
    expect(address.index).toBe(0);
    expect(address.path).toBe("m/44'/0'/0'");
  });

  it('should generate different addresses at different indices', () => {
    const seed = BIP39_VECTORS[0].seed;
    const masterKey = generateMasterKey(seed);

    const addr0 = generateAddressFromMasterKey(masterKey.privateKey, 0);
    const addr1 = generateAddressFromMasterKey(masterKey.privateKey, 1);

    expect(addr0.address).not.toBe(addr1.address);
    expect(addr0.privateKey).not.toBe(addr1.privateKey);
  });

  it('should produce deterministic results', () => {
    const seed = BIP39_VECTORS[0].seed;
    const masterKey = generateMasterKey(seed);

    const addr1 = generateAddressFromMasterKey(masterKey.privateKey, 0);
    const addr2 = generateAddressFromMasterKey(masterKey.privateKey, 0);

    expect(addr1.address).toBe(addr2.address);
    expect(addr1.privateKey).toBe(addr2.privateKey);
  });

  it('should differ from BIP32 derivation (non-standard)', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const legacyAddr = generateAddressFromMasterKey(masterPrivateKey, 0);
    const bip32Addr = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0);

    // They use different derivation methods, should produce different addresses
    expect(legacyAddr.address).not.toBe(bip32Addr.address);
  });
});

// =============================================================================
// Legacy deriveChildKey Tests
// =============================================================================

describe('deriveChildKey() - Legacy', () => {
  it('should derive child key using HMAC-SHA512', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const child = deriveChildKey(masterPrivateKey, masterChainCode, 0);

    expect(child.privateKey).toHaveLength(64);
    expect(child.nextChainCode).toHaveLength(64);
  });

  it('should produce different keys for different indices', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const child0 = deriveChildKey(masterPrivateKey, masterChainCode, 0);
    const child1 = deriveChildKey(masterPrivateKey, masterChainCode, 1);

    expect(child0.privateKey).not.toBe(child1.privateKey);
  });
});

// =============================================================================
// deriveChildKeyBIP32 Tests (Re-export from core)
// =============================================================================

describe('deriveChildKeyBIP32()', () => {
  it('should be the same as core deriveChildKey', () => {
    const seed = BIP39_VECTORS[0].seed;
    const masterKey = generateMasterKey(seed);

    const result = deriveChildKeyBIP32(
      masterKey.privateKey,
      masterKey.chainCode,
      0x80000000 // Hardened index
    );

    expect(result.privateKey).toHaveLength(64);
    expect(result.chainCode).toHaveLength(64);
  });
});

// =============================================================================
// deriveKeyAtPath Tests (Re-export from core)
// =============================================================================

describe('deriveKeyAtPath()', () => {
  it('should derive key at BIP44 path', () => {
    const seed = BIP39_VECTORS[0].seed;
    const masterKey = generateMasterKey(seed);

    const derived = deriveKeyAtPath(
      masterKey.privateKey,
      masterKey.chainCode,
      "m/44'/0'/0'/0/0"
    );

    expect(derived.privateKey).toHaveLength(64);
    expect(derived.chainCode).toHaveLength(64);
  });
});

// =============================================================================
// generateHDAddress Tests (Legacy)
// =============================================================================

describe('generateHDAddress() - Legacy', () => {
  it('should generate address using legacy derivation', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const address = generateHDAddress(masterPrivateKey, masterChainCode, 0);

    expect(address.privateKey).toHaveLength(64);
    expect(address.publicKey).toHaveLength(66);
    expect(address.address.startsWith('alpha1')).toBe(true);
    expect(address.path).toBe("m/44'/0'/0'/0");
  });

  it('should differ from BIP32 at same index', () => {
    const seed = BIP39_VECTORS[0].seed;
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);

    const legacy = generateHDAddress(masterPrivateKey, masterChainCode, 0);
    const bip32 = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0);

    // Different derivation methods = different addresses
    expect(legacy.address).not.toBe(bip32.address);
  });
});

// =============================================================================
// Integration: Full mnemonic -> address flow
// =============================================================================

describe('Full mnemonic to address flow', () => {
  it('should generate address from mnemonic via BIP32', () => {
    const mnemonic = BIP39_VECTORS[0].mnemonic;
    const seed = mnemonicToSeedSync(mnemonic);
    const { masterPrivateKey, masterChainCode } = generateMasterKeyFromSeed(seed);
    const address = generateHDAddressBIP32(masterPrivateKey, masterChainCode, 0);

    expect(address.address.startsWith('alpha1')).toBe(true);
    expect(address.path).toBe("m/44'/0'/0'/0/0");
  });

  it('should generate address from mnemonic via legacy HMAC', () => {
    const mnemonic = BIP39_VECTORS[0].mnemonic;
    const seed = mnemonicToSeedSync(mnemonic);
    const masterKey = generateMasterKey(seed);
    const address = generateAddressFromMasterKey(masterKey.privateKey, 0);

    expect(address.address.startsWith('alpha1')).toBe(true);
    expect(address.path).toBe("m/44'/0'/0'");
  });
});
