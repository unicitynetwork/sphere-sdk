/**
 * Tests for serialization/txf-serializer.ts
 * Covers TXF format serialization and deserialization
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeSdkTokenToStorage,
  tokenToTxf,
  txfToToken,
  buildTxfStorageData,
  parseTxfStorageData,
  getTokenId,
  getCurrentStateHash,
  hasValidTxfData,
  hasUncommittedTransactions,
  countCommittedTransactions,
  hasMissingNewStateHash,
} from '../../../serialization/txf-serializer';
import type { Token } from '../../../types';
import type { TxfToken } from '../../../types/txf';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockTxf = (): TxfToken => ({
  version: '2.0',
  genesis: {
    data: {
      tokenId: 'abc123def456789',
      tokenType: 'fungible_type_hash',
      salt: 'random_salt_hex',
      coinData: [['ALPHA_HEX', '1000000000000000000']],
    },
    inclusionProof: {
      roundNumber: 100,
      rootHash: 'root_hash_hex',
      path: [],
      authenticator: {
        publicKey: 'pubkey_hex',
        signature: 'sig_hex',
      },
    },
  },
  transactions: [],
  nametags: [],
  state: {
    pubKey: 'owner_pubkey_hex',
    nonce: 1,
  },
  _integrity: {
    genesisDataJSONHash: '0'.repeat(64),
  },
});

const createMockToken = (overrides: Partial<Token> = {}): Token => {
  const txf = createMockTxf();
  return {
    id: 'abc123def456789',
    coinId: 'ALPHA_HEX',
    symbol: 'UCT',
    name: 'Token',
    amount: '1000000000000000000',
    status: 'confirmed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sdkData: JSON.stringify(txf),
    ...overrides,
  };
};

// =============================================================================
// normalizeSdkTokenToStorage Tests
// =============================================================================

describe('normalizeSdkTokenToStorage()', () => {
  it('should preserve string values', () => {
    const input = {
      genesis: {
        data: {
          tokenId: 'abc123',
          tokenType: 'type_hex',
        },
      },
    };

    const result = normalizeSdkTokenToStorage(input);

    expect(result.genesis.data.tokenId).toBe('abc123');
    expect(result.genesis.data.tokenType).toBe('type_hex');
  });

  it('should convert bytes object to hex string', () => {
    const input = {
      genesis: {
        data: {
          tokenId: { bytes: [0xab, 0xcd, 0xef] },
          tokenType: 'type_hex',
        },
      },
    };

    const result = normalizeSdkTokenToStorage(input);

    expect(result.genesis.data.tokenId).toBe('abcdef');
  });

  it('should convert Buffer.toJSON() format to hex', () => {
    const input = {
      genesis: {
        data: {
          tokenId: { type: 'Buffer', data: [0xab, 0xcd] },
        },
      },
    };

    const result = normalizeSdkTokenToStorage(input);

    expect(result.genesis.data.tokenId).toBe('abcd');
  });

  it('should normalize authenticator fields', () => {
    const input = {
      genesis: {
        data: { tokenId: 'test' },
        inclusionProof: {
          authenticator: {
            publicKey: { bytes: [0x02, 0xab] },
            signature: { bytes: [0x30, 0x45] },
          },
        },
      },
    };

    const result = normalizeSdkTokenToStorage(input);

    expect(result.genesis.inclusionProof.authenticator.publicKey).toBe('02ab');
    expect(result.genesis.inclusionProof.authenticator.signature).toBe('3045');
  });

  it('should normalize transaction authenticators', () => {
    const input = {
      transactions: [
        {
          inclusionProof: {
            authenticator: {
              publicKey: { bytes: [0x02, 0xcd] },
              signature: { bytes: [0x30, 0x46] },
            },
          },
        },
      ],
    };

    const result = normalizeSdkTokenToStorage(input);

    expect(result.transactions[0].inclusionProof.authenticator.publicKey).toBe('02cd');
    expect(result.transactions[0].inclusionProof.authenticator.signature).toBe('3046');
  });

  it('should not modify original object', () => {
    const input = {
      genesis: {
        data: {
          tokenId: { bytes: [0xab] },
        },
      },
    };

    normalizeSdkTokenToStorage(input);

    // Original should still have bytes object
    expect((input.genesis.data.tokenId as any).bytes).toEqual([0xab]);
  });
});

// =============================================================================
// tokenToTxf Tests
// =============================================================================

describe('tokenToTxf()', () => {
  it('should extract TXF from Token with sdkData', () => {
    const token = createMockToken();
    const result = tokenToTxf(token);

    expect(result).not.toBeNull();
    expect(result!.genesis.data.tokenId).toBe('abc123def456789');
    expect(result!.version).toBe('2.0');
  });

  it('should return null for token without sdkData', () => {
    const token = createMockToken({ sdkData: undefined });
    const result = tokenToTxf(token);

    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    const token = createMockToken({ sdkData: 'invalid json' });
    const result = tokenToTxf(token);

    expect(result).toBeNull();
  });

  it('should return null if genesis is missing', () => {
    const token = createMockToken({ sdkData: JSON.stringify({ state: {} }) });
    const result = tokenToTxf(token);

    expect(result).toBeNull();
  });

  it('should add default version if missing', () => {
    const txf = createMockTxf();
    delete (txf as any).version;
    const token = createMockToken({ sdkData: JSON.stringify(txf) });

    const result = tokenToTxf(token);

    expect(result!.version).toBe('2.0');
  });

  it('should add empty transactions array if missing', () => {
    const txf = createMockTxf();
    delete (txf as any).transactions;
    const token = createMockToken({ sdkData: JSON.stringify(txf) });

    const result = tokenToTxf(token);

    expect(result!.transactions).toEqual([]);
  });
});

// =============================================================================
// txfToToken Tests
// =============================================================================

describe('txfToToken()', () => {
  it('should convert TXF to Token', () => {
    const txf = createMockTxf();
    const token = txfToToken('abc123def456789', txf);

    expect(token.id).toBe('abc123def456789');
    expect(token.coinId).toBe('ALPHA_HEX');
    expect(token.amount).toBe('1000000000000000000');
    expect(token.status).toBe('confirmed');
    expect(token.sdkData).toBeDefined();
  });

  it('should detect pending status from uncommitted transaction', () => {
    const txf = createMockTxf();
    txf.transactions = [
      {
        newStateHash: 'new_hash',
        inclusionProof: null, // Uncommitted
        coins: null,
        nametag: null,
      },
    ];

    const token = txfToToken('test', txf);

    expect(token.status).toBe('pending');
  });

  it('should detect confirmed status with committed transaction', () => {
    const txf = createMockTxf();
    txf.transactions = [
      {
        newStateHash: 'new_hash',
        inclusionProof: {
          roundNumber: 101,
          rootHash: 'root',
          path: [],
          authenticator: { publicKey: 'pk', signature: 'sig' },
        },
        coins: null,
        nametag: null,
      },
    ];

    const token = txfToToken('test', txf);

    expect(token.status).toBe('confirmed');
  });

  it('should sum amounts from multiple coins', () => {
    const txf = createMockTxf();
    txf.genesis.data.coinData = [
      ['COIN1', '100'],
      ['COIN2', '200'],
    ];

    const token = txfToToken('test', txf);

    expect(token.amount).toBe('300');
  });

  it('should detect NFT tokens', () => {
    const txf = createMockTxf();
    txf.genesis.data.tokenType =
      '455ad8720656b08e8dbd5bac1f3c73eeea5431565f6c1c3af742b1aa12d41d89';

    const token = txfToToken('test', txf);

    expect(token.symbol).toBe('NFT');
    expect(token.name).toBe('NFT');
  });
});

// =============================================================================
// buildTxfStorageData Tests
// =============================================================================

describe('buildTxfStorageData()', () => {
  it('should build storage data with meta', async () => {
    const tokens = [createMockToken()];
    const meta = { version: 1, address: 'alpha1test', ipnsName: 'k51test' };

    const result = await buildTxfStorageData(tokens, meta);

    expect(result._meta).toBeDefined();
    expect(result._meta.version).toBe(1);
    expect(result._meta.formatVersion).toBe('2.0');
  });

  it('should add tokens with underscore prefix', async () => {
    const token = createMockToken();
    const meta = { version: 1, address: 'alpha1test' };

    const result = await buildTxfStorageData([token], meta);

    // Tokens are stored with _<tokenId> key (without special prefixes for active tokens)
    const reservedKeys = ['_meta', '_nametag', '_tombstones', '_outbox', '_mintOutbox', '_invalidatedNametags'];
    const tokenKeys = Object.keys(result).filter(
      (k) => k.startsWith('_') && !reservedKeys.includes(k)
    );
    expect(tokenKeys.length).toBe(1);
    expect(tokenKeys[0]).toMatch(/^_[a-z0-9]+$/i);
  });

  it('should include nametag if provided', async () => {
    const meta = { version: 1, address: 'alpha1test' };
    const nametag = { name: '@alice', address: 'alpha1test', timestamp: Date.now() };

    const result = await buildTxfStorageData([], meta, { nametag });

    expect(result._nametag).toEqual(nametag);
  });

  it('should include tombstones if provided', async () => {
    const meta = { version: 1, address: 'alpha1test' };
    const tombstones = [
      { tokenId: 'abc', stateHash: 'hash', timestamp: Date.now(), reason: 'transferred' as const },
    ];

    const result = await buildTxfStorageData([], meta, { tombstones });

    expect(result._tombstones).toEqual(tombstones);
  });

  it('should not include empty arrays', async () => {
    const meta = { version: 1, address: 'alpha1test' };

    const result = await buildTxfStorageData([], meta, { tombstones: [] });

    expect(result._tombstones).toBeUndefined();
  });
});

// =============================================================================
// parseTxfStorageData Tests
// =============================================================================

describe('parseTxfStorageData()', () => {
  it('should parse valid storage data', async () => {
    const tokens = [createMockToken()];
    const meta = { version: 1, address: 'alpha1test' };
    const storageData = await buildTxfStorageData(tokens, meta);

    const parsed = parseTxfStorageData(storageData);

    expect(parsed.tokens.length).toBe(1);
    expect(parsed.meta).toBeDefined();
    expect(parsed.validationErrors.length).toBe(0);
  });

  it('should extract meta and nametag', async () => {
    const meta = { version: 2, address: 'alpha1abc' };
    const nametag = { name: '@bob', address: 'alpha1abc', timestamp: Date.now() };
    const storageData = await buildTxfStorageData([], meta, { nametag });

    const parsed = parseTxfStorageData(storageData);

    expect(parsed.meta?.version).toBe(2);
    expect(parsed.nametag?.name).toBe('@bob');
  });

  it('should extract tombstones', async () => {
    const meta = { version: 1, address: 'alpha1test' };
    const tombstones = [
      { tokenId: 'dead', stateHash: 'hash1', timestamp: 12345, reason: 'transferred' as const },
    ];
    const storageData = await buildTxfStorageData([], meta, { tombstones });

    const parsed = parseTxfStorageData(storageData);

    expect(parsed.tombstones.length).toBe(1);
    expect(parsed.tombstones[0].tokenId).toBe('dead');
  });

  it('should handle null input', () => {
    const parsed = parseTxfStorageData(null);

    expect(parsed.tokens.length).toBe(0);
    expect(parsed.validationErrors.length).toBeGreaterThan(0);
  });

  it('should handle non-object input', () => {
    const parsed = parseTxfStorageData('not an object');

    expect(parsed.validationErrors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('getTokenId()', () => {
  it('should extract token ID from sdkData genesis', () => {
    const token = createMockToken();
    const id = getTokenId(token);

    expect(id).toBe('abc123def456789');
  });

  it('should fallback to token.id if sdkData is missing', () => {
    const token = createMockToken({ sdkData: undefined, id: 'fallback_id' });
    const id = getTokenId(token);

    expect(id).toBe('fallback_id');
  });

  it('should fallback to token.id if sdkData is invalid', () => {
    const token = createMockToken({ sdkData: 'invalid', id: 'fallback_id' });
    const id = getTokenId(token);

    expect(id).toBe('fallback_id');
  });
});

describe('getCurrentStateHash()', () => {
  it('should return newStateHash from last transaction', () => {
    const txf = createMockTxf();
    txf.transactions = [{ newStateHash: 'hash1' } as any, { newStateHash: 'hash2' } as any];

    const hash = getCurrentStateHash(txf);

    expect(hash).toBe('hash2');
  });

  it('should return undefined if no transactions', () => {
    const txf = createMockTxf();
    txf.transactions = [];

    const hash = getCurrentStateHash(txf);

    expect(hash).toBeUndefined();
  });

  it('should fallback to _integrity.currentStateHash', () => {
    const txf = createMockTxf();
    txf.transactions = [];
    txf._integrity!.currentStateHash = 'integrity_hash';

    const hash = getCurrentStateHash(txf);

    expect(hash).toBe('integrity_hash');
  });
});

describe('hasValidTxfData()', () => {
  it('should return true for valid token', () => {
    const token = createMockToken();
    expect(hasValidTxfData(token)).toBe(true);
  });

  it('should return false for token without sdkData', () => {
    const token = createMockToken({ sdkData: undefined });
    expect(hasValidTxfData(token)).toBe(false);
  });

  it('should return false for invalid sdkData', () => {
    const token = createMockToken({ sdkData: '{}' });
    expect(hasValidTxfData(token)).toBe(false);
  });
});

describe('hasUncommittedTransactions()', () => {
  it('should return false for token with no transactions', () => {
    const token = createMockToken();
    expect(hasUncommittedTransactions(token)).toBe(false);
  });

  it('should return true if any transaction has null inclusionProof', () => {
    const txf = createMockTxf();
    txf.transactions = [
      { newStateHash: 'h', inclusionProof: null, coins: null, nametag: null },
    ];
    const token = createMockToken({ sdkData: JSON.stringify(txf) });

    expect(hasUncommittedTransactions(token)).toBe(true);
  });

  it('should return false if all transactions are committed', () => {
    const txf = createMockTxf();
    txf.transactions = [
      {
        newStateHash: 'h',
        inclusionProof: { roundNumber: 1, rootHash: 'r', path: [], authenticator: {} as any },
        coins: null,
        nametag: null,
      },
    ];
    const token = createMockToken({ sdkData: JSON.stringify(txf) });

    expect(hasUncommittedTransactions(token)).toBe(false);
  });
});

describe('countCommittedTransactions()', () => {
  it('should return 0 for token with no transactions', () => {
    const token = createMockToken();
    expect(countCommittedTransactions(token)).toBe(0);
  });

  it('should count only committed transactions', () => {
    const txf = createMockTxf();
    txf.transactions = [
      {
        newStateHash: 'h1',
        inclusionProof: { roundNumber: 1, rootHash: 'r', path: [], authenticator: {} as any },
        coins: null,
        nametag: null,
      },
      { newStateHash: 'h2', inclusionProof: null, coins: null, nametag: null },
      {
        newStateHash: 'h3',
        inclusionProof: { roundNumber: 2, rootHash: 'r', path: [], authenticator: {} as any },
        coins: null,
        nametag: null,
      },
    ];
    const token = createMockToken({ sdkData: JSON.stringify(txf) });

    expect(countCommittedTransactions(token)).toBe(2);
  });
});

describe('hasMissingNewStateHash()', () => {
  it('should return false for token with no transactions', () => {
    const txf = createMockTxf();
    txf.transactions = [];
    expect(hasMissingNewStateHash(txf)).toBe(false);
  });

  it('should return true if any transaction lacks newStateHash', () => {
    const txf = createMockTxf();
    txf.transactions = [
      { newStateHash: undefined as any, inclusionProof: null, coins: null, nametag: null },
    ];
    expect(hasMissingNewStateHash(txf)).toBe(true);
  });

  it('should return false if all transactions have newStateHash', () => {
    const txf = createMockTxf();
    txf.transactions = [
      { newStateHash: 'hash1', inclusionProof: null, coins: null, nametag: null },
    ];
    expect(hasMissingNewStateHash(txf)).toBe(false);
  });
});
