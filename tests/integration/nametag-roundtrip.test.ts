/**
 * Integration test for nametag registration and resolution
 * Tests the full cycle: register -> resolve
 *
 * Key behavior (matching nostr-js-sdk):
 * - registerNametag uses 32-byte Nostr pubkey from keyManager (not passed publicKey)
 * - resolveNametag returns event.pubkey (the signer), not address tag
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NostrTransportProvider } from '../../transport/NostrTransportProvider';
import type {
  IWebSocket,
  IMessageEvent,
  WebSocketFactory,
} from '../../transport/websocket';
import { WebSocketReadyState } from '../../transport/websocket';
import type { FullIdentity } from '../../types';
import { hashNametag } from '@unicitylabs/nostr-js-sdk';

// =============================================================================
// Mock Relay that stores and returns events
// =============================================================================

interface NostrEvent {
  id: string;
  kind: number;
  content: string;
  tags: string[][];
  pubkey: string;
  created_at: number;
  sig: string;
}

class MockRelayWebSocket implements IWebSocket {
  readyState: number = WebSocketReadyState.CONNECTING;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: IMessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  private url: string;
  private static storedEvents: NostrEvent[] = [];

  constructor(url: string) {
    this.url = url;

    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocketReadyState.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  static clearEvents(): void {
    MockRelayWebSocket.storedEvents = [];
  }

  static getStoredEvents(): NostrEvent[] {
    return [...MockRelayWebSocket.storedEvents];
  }

  send(data: string): void {
    const message = JSON.parse(data);
    const [type, ...args] = message;

    if (type === 'EVENT') {
      // Store the event
      const event = args[0] as NostrEvent;
      MockRelayWebSocket.storedEvents.push(event);

      // Send OK response
      setTimeout(() => {
        this.onmessage?.({
          data: JSON.stringify(['OK', event.id, true, '']),
        } as IMessageEvent);
      }, 5);
    } else if (type === 'REQ') {
      // Query events
      const subId = args[0];
      const filter = args[1];

      // Find matching events
      const matchingEvents = MockRelayWebSocket.storedEvents.filter((event) => {
        // Check kind
        if (filter.kinds && !filter.kinds.includes(event.kind)) {
          return false;
        }

        // Check #t tag
        if (filter['#t']) {
          const tTags = event.tags.filter((t) => t[0] === 't').map((t) => t[1]);
          if (!filter['#t'].some((v: string) => tTags.includes(v))) {
            return false;
          }
        }

        // Check #d tag
        if (filter['#d']) {
          const dTags = event.tags.filter((t) => t[0] === 'd').map((t) => t[1]);
          if (!filter['#d'].some((v: string) => dTags.includes(v))) {
            return false;
          }
        }

        return true;
      });

      // Send matching events
      setTimeout(() => {
        for (const event of matchingEvents.slice(0, filter.limit || 10)) {
          this.onmessage?.({
            data: JSON.stringify(['EVENT', subId, event]),
          } as IMessageEvent);
        }

        // Send EOSE
        this.onmessage?.({
          data: JSON.stringify(['EOSE', subId]),
        } as IMessageEvent);
      }, 10);
    } else if (type === 'CLOSE') {
      // Subscription closed, do nothing
    }
  }

  close(): void {
    this.readyState = WebSocketReadyState.CLOSED;
    this.onclose?.({ code: 1000, reason: 'Normal closure' } as CloseEvent);
  }
}

const createMockWebSocket: WebSocketFactory = (url: string) => {
  return new MockRelayWebSocket(url);
};

// =============================================================================
// Test Identity
// =============================================================================

const TEST_IDENTITY: FullIdentity = {
  privateKey: 'a'.repeat(64),
  publicKey: 'b'.repeat(64), // This is NOT used by registerNametag
  address: 'alpha1testaddress',
  ipnsName: '12D3KooWtest',
  nametag: undefined,
};

// =============================================================================
// Tests
// =============================================================================

describe('Nametag roundtrip integration', () => {
  let provider: NostrTransportProvider;

  beforeEach(() => {
    MockRelayWebSocket.clearEvents();

    provider = new NostrTransportProvider({
      relays: ['wss://mock-relay.test'],
      createWebSocket: createMockWebSocket,
      timeout: 1000,
      autoReconnect: false,
    });
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('should register nametag with correct event structure', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'test-lottery';

    // Register nametag
    const registerResult = await provider.registerNametag(
      nametag,
      TEST_IDENTITY.publicKey
    );
    expect(registerResult).toBe(true);

    // Verify event was stored
    const storedEvents = MockRelayWebSocket.getStoredEvents();
    expect(storedEvents.length).toBe(1);

    const event = storedEvents[0];
    expect(event.kind).toBe(30078); // NAMETAG_BINDING (APP_DATA)

    // Check tags include all required fields (matching nostr-js-sdk format)
    const tagNames = event.tags.map((t) => t[0]);
    expect(tagNames).toContain('d'); // Required for parameterized replaceable
    expect(tagNames).toContain('t'); // Indexed tag for relay search
    expect(tagNames).toContain('nametag'); // Hashed nametag
    expect(tagNames).toContain('address'); // Nostr pubkey

    // Check content is valid JSON with correct structure
    const content = JSON.parse(event.content);
    expect(content).toHaveProperty('nametag_hash');
    expect(content).toHaveProperty('address');
    expect(content).toHaveProperty('verified');
  });

  it('should use 32-byte nostr pubkey from keyManager, not passed publicKey', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'pubkey-test';

    await provider.registerNametag(nametag, TEST_IDENTITY.publicKey);

    const storedEvents = MockRelayWebSocket.getStoredEvents();
    const event = storedEvents[0];

    // Get the actual nostr pubkey used
    const nostrPubkey = provider.getNostrPubkey();

    // Address tag should contain nostrPubkey (from keyManager), NOT TEST_IDENTITY.publicKey
    const addressTag = event.tags.find((t) => t[0] === 'address');
    expect(addressTag?.[1]).toBe(nostrPubkey);
    expect(addressTag?.[1]).not.toBe(TEST_IDENTITY.publicKey);

    // Content should also use nostrPubkey
    const content = JSON.parse(event.content);
    expect(content.address).toBe(nostrPubkey);

    // event.pubkey is the signer - should match nostrPubkey
    expect(event.pubkey).toBe(nostrPubkey);
  });

  it('should resolve nametag returning event.pubkey (the signer)', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'resolve-test';

    await provider.registerNametag(nametag, TEST_IDENTITY.publicKey);

    // Get the stored event
    const storedEvents = MockRelayWebSocket.getStoredEvents();
    const event = storedEvents[0];

    // resolveNametag should return event.pubkey (the signer)
    const resolved = await provider.resolveNametag(nametag);
    expect(resolved).toBe(event.pubkey);

    // This should be the nostr pubkey from keyManager
    expect(resolved).toBe(provider.getNostrPubkey());
  });

  it('should return null for non-existent nametag', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const resolvedPubkey = await provider.resolveNametag('non-existent');
    expect(resolvedPubkey).toBeNull();
  });

  it('should allow re-registration by same pubkey (republish with correct format)', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'republish-test';
    const nostrPubkey = provider.getNostrPubkey();

    // Register first time
    const result1 = await provider.registerNametag(
      nametag,
      TEST_IDENTITY.publicKey
    );
    expect(result1).toBe(true);

    // Register second time - should succeed and republish
    const result2 = await provider.registerNametag(
      nametag,
      TEST_IDENTITY.publicKey
    );
    expect(result2).toBe(true);

    // Two events stored (always republishes to ensure correct format)
    const storedEvents = MockRelayWebSocket.getStoredEvents();
    expect(storedEvents.length).toBe(2);

    // Both events have same pubkey
    expect(storedEvents[0].pubkey).toBe(nostrPubkey);
    expect(storedEvents[1].pubkey).toBe(nostrPubkey);
  });

  it('should reject registration if nametag taken by another pubkey', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'taken-tag';

    // Manually insert an event from "another user" with different pubkey
    const otherPubkey = 'c'.repeat(64);
    const hashedNametag = hashNametag(nametag);

    // Simulate event from another user
    const fakeEvent: NostrEvent = {
      id: 'fake-id',
      kind: 30078,
      content: JSON.stringify({
        nametag_hash: hashedNametag,
        address: otherPubkey,
        verified: Date.now(),
      }),
      tags: [
        ['d', hashedNametag],
        ['t', hashedNametag],
        ['nametag', hashedNametag],
        ['address', otherPubkey],
      ],
      pubkey: otherPubkey, // Different pubkey (the signer)
      created_at: Math.floor(Date.now() / 1000),
      sig: 'fake-sig',
    };
    MockRelayWebSocket['storedEvents'].push(fakeEvent);

    // Try to register with our identity - should fail
    const result = await provider.registerNametag(
      nametag,
      TEST_IDENTITY.publicKey
    );
    expect(result).toBe(false);

    // No new events added
    expect(MockRelayWebSocket.getStoredEvents().length).toBe(1);
  });

  it('should query by #t tag first (nostr-js-sdk format)', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 't-tag-test';

    await provider.registerNametag(nametag, TEST_IDENTITY.publicKey);

    // Event should have 't' tag for indexed search
    const storedEvents = MockRelayWebSocket.getStoredEvents();
    const event = storedEvents[0];
    const tTag = event.tags.find((t) => t[0] === 't');
    expect(tTag).toBeDefined();

    // Resolution should work via #t tag query
    const resolved = await provider.resolveNametag(nametag);
    expect(resolved).toBe(event.pubkey);
  });

  it('should use hashed nametag for privacy', async () => {
    provider.setIdentity(TEST_IDENTITY);
    await provider.connect();

    const nametag = 'my-secret-tag';

    await provider.registerNametag(nametag, TEST_IDENTITY.publicKey);

    const storedEvents = MockRelayWebSocket.getStoredEvents();
    const event = storedEvents[0];

    // Raw nametag should NOT appear anywhere in the event
    const eventStr = JSON.stringify(event);
    expect(eventStr).not.toContain(nametag);

    // But hashed version should be in tags
    const hashedNametag = hashNametag(nametag);
    expect(eventStr).toContain(hashedNametag);
  });

  it('getNostrPubkey should return 32-byte hex (64 chars)', async () => {
    provider.setIdentity(TEST_IDENTITY);

    const nostrPubkey = provider.getNostrPubkey();

    // Should be 64 hex characters (32 bytes)
    expect(nostrPubkey).toHaveLength(64);
    expect(nostrPubkey).toMatch(/^[0-9a-f]{64}$/);

    // Should NOT have 02/03 prefix (compressed key format)
    expect(nostrPubkey.startsWith('02')).toBe(false);
    expect(nostrPubkey.startsWith('03')).toBe(false);
  });
});
