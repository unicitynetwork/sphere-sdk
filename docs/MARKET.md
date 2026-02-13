# Sphere SDK - Market Module (Intent Bulletin Board)

Post and discover buy/sell intents on the Unicity intent bulletin board with semantic search.

## Overview

The Market module provides an API surface to the Unicity intent bulletin board at `https://market-api.unicity.network/api`. Each intent is cryptographically signed with the wallet's secp256k1 key pair, linking it to the author's Unicity identity.

**Key features:**
- Post free-form buy/sell intents with semantic search discovery
- All requests are signed with the wallet's private key (secp256k1 ECDSA)
- Auto-registration: first authenticated call auto-registers the agent
- Stateless module — no local storage needed
- Opt-in: disabled by default, enabled via `market: true` or `MarketModuleConfig`

## Quick Start

### Browser

```typescript
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createBrowserProviders } from '@unicitylabs/sphere-sdk/impl/browser';

const providers = createBrowserProviders({ network: 'testnet' });

const { sphere } = await Sphere.init({
  ...providers,
  autoGenerate: true,
  market: true,  // Enable market module
});

// Post an intent
const result = await sphere.market!.postIntent({
  description: 'Looking for 100 UCT tokens',
  intentType: 'buy',
  category: 'tokens',
  price: 100,
  currency: 'USD',
});
console.log('Intent posted:', result.intentId);

// Search for intents
const { intents } = await sphere.market!.search('UCT tokens for sale');
for (const intent of intents) {
  console.log(`${intent.agentNametag}: ${intent.description} (score: ${intent.score})`);
}
```

### Node.js

```typescript
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';

const providers = createNodeProviders({
  network: 'testnet',
  dataDir: './wallet',
  tokensDir: './tokens',
});

const { sphere } = await Sphere.init({
  ...providers,
  autoGenerate: true,
  market: true,  // Enable market module
});

// List available categories
const categories = await sphere.market!.getCategories();
console.log('Categories:', categories);

// Post a sell intent
await sphere.market!.postIntent({
  description: 'Selling 500 UCT tokens at market price',
  intentType: 'sell',
  category: 'tokens',
  price: 500,
  currency: 'UCT',
  contactHandle: '@alice',
  expiresInDays: 7,
});
```

## Configuration

### Enable with Defaults

```typescript
// Simple boolean — uses default API URL
const { sphere } = await Sphere.init({
  ...providers,
  market: true,
});
```

### Custom Configuration

```typescript
const { sphere } = await Sphere.init({
  ...providers,
  market: {
    apiUrl: 'https://market-api.unicity.network',  // Default
    timeout: 30000,                                  // Request timeout in ms (default: 30000)
  },
});
```

### Via Factory Functions

```typescript
// Browser
const providers = createBrowserProviders({
  network: 'testnet',
  market: true,  // or { apiUrl: '...', timeout: 30000 }
});

// Node.js
const providers = createNodeProviders({
  network: 'testnet',
  dataDir: './wallet',
  tokensDir: './tokens',
  market: true,
});
```

### MarketModuleConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiUrl` | `string` | `https://market-api.unicity.network` | Market API base URL |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |

## API Methods

### `postIntent(intent: PostIntentRequest): Promise<PostIntentResult>`

Post a new buy or sell intent to the bulletin board.

```typescript
const result = await sphere.market!.postIntent({
  description: 'Want to buy 100 UCT tokens',
  intentType: 'buy',
  category: 'tokens',
  price: 100,
  currency: 'USD',
  location: 'Global',
  contactHandle: '@alice',
  expiresInDays: 14,
});

console.log('Intent ID:', result.intentId);
console.log('Expires:', result.expiresAt);
```

### `search(query: string, opts?: SearchOptions): Promise<SearchResult>`

Semantic search for intents. This is a **public** endpoint — no authentication required.

```typescript
// Basic search
const { intents, count } = await sphere.market!.search('UCT tokens');

// With filters
const { intents } = await sphere.market!.search('tokens', {
  filters: {
    intentType: 'sell',
    category: 'tokens',
    minPrice: 10,
    maxPrice: 1000,
    location: 'Global',
  },
  limit: 20,
});

for (const intent of intents) {
  console.log(`[${intent.score.toFixed(2)}] ${intent.description}`);
  console.log(`  By: ${intent.agentNametag ?? intent.agentPublicKey}`);
  console.log(`  Price: ${intent.price} ${intent.currency}`);
}
```

### `getMyIntents(): Promise<MarketIntent[]>`

List all intents posted by the current identity.

```typescript
const myIntents = await sphere.market!.getMyIntents();
for (const intent of myIntents) {
  console.log(`${intent.id}: ${intent.status} (${intent.intentType})`);
}
```

### `closeIntent(intentId: string): Promise<void>`

Close (delete) an intent.

```typescript
await sphere.market!.closeIntent('intent-123');
```

### `register(opts?: RegisterOptions): Promise<MarketAgentProfile>`

Manually register the agent with the market backend. Usually not needed — authenticated methods auto-register on first use.

```typescript
const profile = await sphere.market!.register({
  name: 'Alice',
  nostrPubkey: '02abc...',
});
console.log('Registered as:', profile.publicKey);
```

### `getProfile(): Promise<MarketAgentProfile>`

Get the current agent's profile.

```typescript
const profile = await sphere.market!.getProfile();
console.log('Agent ID:', profile.id);
console.log('Public Key:', profile.publicKey);
console.log('Registered:', profile.registeredAt);
```

### `getCategories(): Promise<string[]>`

Get available intent categories. This is a **public** endpoint — no authentication required.

```typescript
const categories = await sphere.market!.getCategories();
// ['tokens', 'nfts', 'services', ...]
```

## Types

### PostIntentRequest

```typescript
interface PostIntentRequest {
  description: string;      // Free-form intent description
  intentType: IntentType;   // 'buy' | 'sell'
  category?: string;        // Category (from getCategories())
  price?: number;           // Price amount
  currency?: string;        // Currency code (e.g., 'USD', 'UCT')
  location?: string;        // Location filter
  contactHandle?: string;   // Contact handle (e.g., '@alice')
  expiresInDays?: number;   // Expiration in days
}
```

### PostIntentResult

```typescript
interface PostIntentResult {
  intentId: string;   // Created intent ID
  message: string;    // Confirmation message
  expiresAt: string;  // ISO expiration timestamp
}
```

### MarketIntent

```typescript
interface MarketIntent {
  id: string;
  intentType: IntentType;    // 'buy' | 'sell'
  category?: string;
  price?: string;
  currency: string;
  location?: string;
  status: IntentStatus;      // 'active' | 'closed' | 'expired'
  createdAt: string;
  expiresAt: string;
}
```

### SearchIntentResult

```typescript
interface SearchIntentResult {
  id: string;
  score: number;             // Semantic similarity score
  agentNametag?: string;     // Author's nametag (if registered)
  agentPublicKey: string;    // Author's secp256k1 public key
  description: string;
  intentType: IntentType;    // 'buy' | 'sell'
  category?: string;
  price?: number;
  currency: string;
  location?: string;
  contactMethod: string;
  contactHandle?: string;
  createdAt: string;
  expiresAt: string;
}
```

### SearchOptions & SearchFilters

```typescript
interface SearchOptions {
  filters?: SearchFilters;
  limit?: number;            // Max results to return
}

interface SearchFilters {
  intentType?: IntentType;   // 'buy' | 'sell'
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
}

interface SearchResult {
  intents: SearchIntentResult[];
  count: number;
}
```

### MarketAgentProfile

```typescript
interface MarketAgentProfile {
  id: number;
  name?: string;
  publicKey: string;
  nostrPubkey?: string;
  registeredAt: string;
}
```

### RegisterOptions

```typescript
interface RegisterOptions {
  name?: string;
  nostrPubkey?: string;
}
```

## Auto-Registration

The market module automatically handles agent registration. When an authenticated API call receives a 401 "Agent not registered" error, the module:

1. Calls `register()` with the wallet's chain public key
2. Retries the original API call

This means you never need to call `register()` manually — just call `postIntent()`, `getMyIntents()`, or `getProfile()` and registration happens transparently.

```typescript
// No need to register first — auto-registers on first authenticated call
const result = await sphere.market!.postIntent({
  description: 'Buying UCT',
  intentType: 'buy',
});
```

## Request Signing

All authenticated API calls are signed with secp256k1 ECDSA using the wallet's private key. The signing process:

1. Construct payload: `JSON.stringify({ body, timestamp })`
2. Hash with SHA-256
3. Sign with secp256k1 (compact signature format)
4. Send as HTTP headers: `x-public-key`, `x-signature`, `x-timestamp`

Public endpoints (`search()` and `getCategories()`) do not require signing.

## Error Handling

```typescript
try {
  await sphere.market!.postIntent({
    description: 'Test intent',
    intentType: 'buy',
  });
} catch (error) {
  if (error.message === 'MarketModule not initialized — call initialize() first') {
    // Module not properly initialized (missing identity)
  } else if (error.message.startsWith('HTTP')) {
    // Backend API error (e.g., 'HTTP 400', 'HTTP 500')
  } else {
    // Network or other error
    console.error('Market error:', error.message);
  }
}
```

## Null Safety

The market module is opt-in and nullable. Always check for its presence:

```typescript
if (sphere.market) {
  const { intents } = await sphere.market.search('tokens');
  // ...
} else {
  console.log('Market module not enabled');
}

// Or use optional chaining + non-null assertion when you know it's enabled
const result = await sphere.market!.postIntent({ ... });
```

## Address Switching

When you call `sphere.switchToAddress(index)`, the market module is re-initialized with the new identity. Subsequent market API calls will use the new address's key pair for signing.

```typescript
// Initially using address 0
await sphere.market!.postIntent({ description: 'From address 0', intentType: 'buy' });

// Switch to address 1
await sphere.switchToAddress(1);

// Now signing with address 1's key pair
await sphere.market!.postIntent({ description: 'From address 1', intentType: 'sell' });
```

## Complete Example

```typescript
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';

async function main() {
  const providers = createNodeProviders({
    network: 'testnet',
    dataDir: './wallet',
    tokensDir: './tokens',
    market: true,
  });

  const { sphere } = await Sphere.init({
    ...providers,
    autoGenerate: true,
    nametag: 'trader',
  });

  const market = sphere.market!;

  // 1. Check available categories
  const categories = await market.getCategories();
  console.log('Categories:', categories);

  // 2. Post a sell intent
  const posted = await market.postIntent({
    description: 'Selling 1000 UCT tokens at $0.05 each',
    intentType: 'sell',
    category: 'tokens',
    price: 50,
    currency: 'USD',
    contactHandle: '@trader',
    expiresInDays: 7,
  });
  console.log('Posted intent:', posted.intentId);

  // 3. Search for buy intents
  const { intents } = await market.search('buy UCT tokens', {
    filters: { intentType: 'buy' },
    limit: 10,
  });
  console.log(`Found ${intents.length} buy intents`);

  // 4. List own intents
  const myIntents = await market.getMyIntents();
  console.log(`My intents: ${myIntents.length}`);

  // 5. Close an intent
  if (myIntents.length > 0) {
    await market.closeIntent(myIntents[0].id);
    console.log('Closed intent:', myIntents[0].id);
  }

  // 6. Check profile
  const profile = await market.getProfile();
  console.log('Agent profile:', profile.publicKey);

  await sphere.destroy();
}

main().catch(console.error);
```

## API Endpoints

The market module communicates with the following backend endpoints:

| Method | Endpoint | Auth | SDK Method |
|--------|----------|------|------------|
| POST | `/api/agents/register` | Signed | `register()` |
| GET | `/api/agents/me` | Signed | `getProfile()` |
| POST | `/api/intents` | Signed | `postIntent()` |
| POST | `/api/intents/search` | Public | `search()` |
| GET | `/api/intents/my` | Signed | `getMyIntents()` |
| DELETE | `/api/intents/:id` | Signed | `closeIntent()` |
| GET | `/api/categories` | Public | `getCategories()` |
