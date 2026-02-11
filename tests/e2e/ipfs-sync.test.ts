/**
 * E2E Test: IPFS Sync against Unicity IPFS testnet node
 *
 * This test requires network access to the Unicity IPFS node.
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IpfsStorageProvider } from '../../impl/shared/ipfs/ipfs-storage-provider';
import { InMemoryIpfsStatePersistence } from '../../impl/shared/ipfs/ipfs-state-persistence';
import { getIpfsGatewayUrls } from '../../constants';
import type { TxfStorageDataBase } from '../../storage';
import type { FullIdentity } from '../../types';

// Use a random key to avoid conflicts between test runs
function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('IPFS Sync E2E', () => {
  let provider: IpfsStorageProvider;
  let statePersistence: InMemoryIpfsStatePersistence;
  const testPrivateKey = randomHex(32);

  const testIdentity: FullIdentity = {
    privateKey: testPrivateKey,
    chainPubkey: '03' + randomHex(32),
    l1Address: 'alpha1test' + randomHex(10),
    directAddress: 'DIRECT://test' + randomHex(10),
  };

  const gateways = getIpfsGatewayUrls();

  beforeAll(async () => {
    statePersistence = new InMemoryIpfsStatePersistence();
    provider = new IpfsStorageProvider(
      {
        gateways,
        debug: true,
        fetchTimeoutMs: 30000,
        resolveTimeoutMs: 15000,
        publishTimeoutMs: 60000,
      },
      statePersistence,
    );

    provider.setIdentity(testIdentity);
    const initialized = await provider.initialize();
    if (!initialized) {
      console.warn('Failed to initialize IPFS provider — skipping E2E tests');
    }
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it('should initialize and derive IPNS name', () => {
    expect(provider.isConnected()).toBe(true);
    expect(provider.getIpnsName()).toBeTruthy();
    expect(provider.getIpnsName()!.startsWith('12D3KooW')).toBe(true);
  });

  it('should upload and retrieve data', async () => {
    const testData: TxfStorageDataBase = {
      _meta: {
        version: 1,
        address: testIdentity.directAddress!,
        formatVersion: '2.0',
        updatedAt: Date.now(),
      },
      _testtoken1: {
        id: 'testtoken1',
        coinId: 'UCT',
        amount: '1000000',
      },
    };

    // Save
    const saveResult = await provider.save(testData);
    expect(saveResult.success).toBe(true);
    expect(saveResult.cid).toBeTruthy();

    // Load by CID
    const loadResult = await provider.load(saveResult.cid!);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBeTruthy();
    expect((loadResult.data as any)._testtoken1?.coinId).toBe('UCT');
  }, 60000);

  it('should sync with modifications', async () => {
    const localData: TxfStorageDataBase = {
      _meta: {
        version: 2,
        address: testIdentity.directAddress!,
        formatVersion: '2.0',
        updatedAt: Date.now(),
      },
      _testtoken1: { id: 'testtoken1', coinId: 'UCT', amount: '500000' },
      _testtoken2: { id: 'testtoken2', coinId: 'UCT', amount: '300000' },
    };

    const syncResult = await provider.sync(localData);
    expect(syncResult.success).toBe(true);
    expect(syncResult.merged).toBeTruthy();
  }, 60000);

  it('should report existence after publish', async () => {
    const exists = await provider.exists!();
    expect(exists).toBe(true);
  }, 30000);

  it('should recover full inventory from IPFS after local storage wipe', async () => {
    // Use a FRESH private key so this IPNS name has no prior routing history
    // on the gateway — avoids stale-cache issues from earlier tests.
    const freshKey = randomHex(32);
    const freshIdentity: FullIdentity = {
      privateKey: freshKey,
      chainPubkey: '03' + randomHex(32),
      l1Address: 'alpha1recovery' + randomHex(10),
      directAddress: 'DIRECT://recovery' + randomHex(10),
    };

    const providerConfig = {
      gateways,
      debug: true,
      fetchTimeoutMs: 30000,
      resolveTimeoutMs: 15000,
      publishTimeoutMs: 60000,
    };

    // --- Provider A: save inventory ---
    const providerA = new IpfsStorageProvider(
      providerConfig,
      new InMemoryIpfsStatePersistence(),
    );
    providerA.setIdentity(freshIdentity);
    expect(await providerA.initialize()).toBe(true);
    console.log(`Recovery test: IPNS name = ${providerA.getIpnsName()}`);

    const inventory: TxfStorageDataBase = {
      _meta: {
        version: 1,
        address: freshIdentity.directAddress!,
        formatVersion: '2.0',
        updatedAt: Date.now(),
      },
      _tokenAlpha: { id: 'tokenAlpha', coinId: 'UCT', amount: '5000000' },
      _tokenBravo: { id: 'tokenBravo', coinId: 'UCT', amount: '2500000' },
      _tokenCharlie: { id: 'tokenCharlie', coinId: 'GEMA', amount: '100' },
    };

    const saveResult = await providerA.save(inventory);
    expect(saveResult.success).toBe(true);
    expect(saveResult.cid).toBeTruthy();
    console.log(`Saved CID=${saveResult.cid}, seq=${providerA.getSequenceNumber()}`);

    // Destroy Provider A — simulates full local storage wipe
    await providerA.shutdown();

    // Wait for IPNS propagation (first-ever record for this name)
    console.log('Waiting for IPNS propagation...');
    await new Promise((r) => setTimeout(r, 5000));

    // --- Provider B: fresh instance, same key, NO persisted state ---
    const providerB = new IpfsStorageProvider(
      providerConfig,
      new InMemoryIpfsStatePersistence(),
    );
    providerB.setIdentity(freshIdentity);
    expect(await providerB.initialize()).toBe(true);

    // Verify Provider B has zero local state
    expect(providerB.getLastCid()).toBeNull();
    expect(providerB.getSequenceNumber()).toBe(0n);

    // Recovery: load via IPNS resolution (retry up to 60s for propagation)
    let recovered;
    for (let attempt = 1; attempt <= 12; attempt++) {
      recovered = await providerB.load();
      if (recovered.success && recovered.data) {
        console.log(`IPNS resolved on attempt ${attempt}`);
        break;
      }
      console.log(`Attempt ${attempt}: ${recovered.error} — retrying in 5s...`);
      await new Promise((r) => setTimeout(r, 5000));
    }

    expect(recovered!.success).toBe(true);
    expect(recovered!.data).toBeTruthy();

    // Verify the recovered inventory matches what was saved
    const data = recovered!.data as any;
    expect(data._tokenAlpha?.coinId).toBe('UCT');
    expect(data._tokenAlpha?.amount).toBe('5000000');
    expect(data._tokenBravo?.coinId).toBe('UCT');
    expect(data._tokenBravo?.amount).toBe('2500000');
    expect(data._tokenCharlie?.coinId).toBe('GEMA');
    expect(data._tokenCharlie?.amount).toBe('100');

    console.log('Recovery test PASSED: all tokens recovered from IPFS');
    await providerB.shutdown();
  }, 180000);
});
