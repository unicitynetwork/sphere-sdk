/**
 * E2E test: NIP-17 DM round-trip over real testnet relay.
 *
 * Creates two ephemeral Sphere wallets (Alice and Bob), registers nametags,
 * and tests DM delivery both by pubkey and by nametag.
 *
 * Run manually:
 *   npm run test:e2e
 */

import { describe, it, expect, afterEach } from 'vitest';
import { Sphere } from '../../core/Sphere';
import { createNodeProviders } from '../../impl/nodejs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DirectMessage } from '../../types';

const rand = () => Math.random().toString(36).slice(2, 8);

function makeTempDirs(label: string) {
  const base = join(tmpdir(), `sphere-e2e-${label}-${Date.now()}-${rand()}`);
  const dataDir = join(base, 'data');
  const tokensDir = join(base, 'tokens');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(tokensDir, { recursive: true });
  return { base, dataDir, tokensDir };
}

function waitForDM(sphere: Sphere, timeoutMs = 15000): Promise<DirectMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: DM not received within ${timeoutMs}ms`)), timeoutMs);
    sphere.communications.onDirectMessage((msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

async function createSphere(label: string, nametag?: string) {
  const dirs = makeTempDirs(label);
  const providers = createNodeProviders({ network: 'testnet', dataDir: dirs.dataDir, tokensDir: dirs.tokensDir });
  const result = await Sphere.init({ ...providers, autoGenerate: true, ...(nametag ? { nametag } : {}) });
  return { sphere: result.sphere, dirs };
}

describe('NIP-17 DM end-to-end', () => {
  const cleanupDirs: string[] = [];
  const spheres: Sphere[] = [];

  afterEach(async () => {
    for (const s of spheres) {
      try { await s.destroy(); } catch { /* cleanup */ }
    }
    spheres.length = 0;
    for (const d of cleanupDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
    cleanupDirs.length = 0;
  });

  it('sends DM by pubkey', async () => {
    const { sphere: alice, dirs: aliceDirs } = await createSphere('alice');
    const { sphere: bob, dirs: bobDirs } = await createSphere('bob');
    spheres.push(alice, bob);
    cleanupDirs.push(aliceDirs.base, bobDirs.base);

    // Subscribe Bob first, then wait for relay subscription to establish
    const dmPromise = waitForDM(bob);
    await new Promise((r) => setTimeout(r, 3000));

    // Use 32-byte x-only pubkey
    const bobPubkey = bob.identity!.publicKey;
    const bobNostrPubkey = bobPubkey.length === 66 ? bobPubkey.slice(2) : bobPubkey;

    const text = `pubkey test ${Date.now()}`;
    await alice.communications.sendDM(bobNostrPubkey, text);

    const msg = await dmPromise;
    expect(msg.content).toBe(text);
    expect(msg.senderPubkey).toBeTruthy();
    expect(msg.isRead).toBe(false);
  }, 30000);

  it('sends DM by nametag', async () => {
    const aliceTag = `e2e-alice-${rand()}`;
    const bobTag = `e2e-bob-${rand()}`;

    // Sphere.init with nametag auto-registers it
    const { sphere: alice, dirs: aliceDirs } = await createSphere('alice', aliceTag);
    const { sphere: bob, dirs: bobDirs } = await createSphere('bob', bobTag);
    spheres.push(alice, bob);
    cleanupDirs.push(aliceDirs.base, bobDirs.base);

    expect(alice.identity!.nametag).toBe(aliceTag);
    expect(bob.identity!.nametag).toBe(bobTag);

    // Subscribe Bob, wait for relay subscription + nametag propagation
    const dmPromise = waitForDM(bob);
    await new Promise((r) => setTimeout(r, 3000));

    const text = `nametag test ${Date.now()}`;
    await alice.communications.sendDM(`@${bobTag}`, text);

    const msg = await dmPromise;
    expect(msg.content).toBe(text);
    expect(msg.senderNametag).toBe(aliceTag);
    expect(msg.isRead).toBe(false);
  }, 45000);
});
