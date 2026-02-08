/**
 * CoinGecko Price Provider
 *
 * Fetches token prices from CoinGecko API with internal caching.
 * Supports both free and pro API tiers.
 */

import type { PriceProvider, PricePlatform, TokenPrice, PriceProviderConfig } from './price-provider';

// =============================================================================
// Types
// =============================================================================

interface CacheEntry {
  price: TokenPrice;
  expiresAt: number;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * CoinGecko price provider
 *
 * @example
 * ```ts
 * // Free tier (no API key)
 * const provider = new CoinGeckoPriceProvider();
 *
 * // Pro tier
 * const provider = new CoinGeckoPriceProvider({ apiKey: 'CG-xxx' });
 *
 * const prices = await provider.getPrices(['bitcoin', 'ethereum']);
 * console.log(prices.get('bitcoin')?.priceUsd);
 * ```
 */
export class CoinGeckoPriceProvider implements PriceProvider {
  readonly platform: PricePlatform = 'coingecko';

  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly apiKey?: string;
  private readonly cacheTtlMs: number;
  private readonly timeout: number;
  private readonly debug: boolean;
  private readonly baseUrl: string;

  constructor(config?: Omit<PriceProviderConfig, 'platform'>) {
    this.apiKey = config?.apiKey;
    this.cacheTtlMs = config?.cacheTtlMs ?? 60_000;
    this.timeout = config?.timeout ?? 10_000;
    this.debug = config?.debug ?? false;

    this.baseUrl = this.apiKey
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3';
  }

  async getPrices(tokenNames: string[]): Promise<Map<string, TokenPrice>> {
    if (tokenNames.length === 0) {
      return new Map();
    }

    const now = Date.now();
    const result = new Map<string, TokenPrice>();
    const uncachedNames: string[] = [];

    // Check cache first
    for (const name of tokenNames) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > now) {
        result.set(name, cached.price);
      } else {
        uncachedNames.push(name);
      }
    }

    // All cached — return immediately
    if (uncachedNames.length === 0) {
      return result;
    }

    // Fetch uncached prices
    try {
      const ids = uncachedNames.join(',');
      const url = `${this.baseUrl}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,eur&include_24hr_change=true`;

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (this.apiKey) {
        headers['x-cg-pro-api-key'] = this.apiKey;
      }

      if (this.debug) {
        console.log(`[CoinGecko] Fetching prices for: ${uncachedNames.join(', ')}`);
      }

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as Record<string, Record<string, number>>;

      // Parse and cache response
      for (const [name, values] of Object.entries(data)) {
        if (values && typeof values === 'object') {
          const price: TokenPrice = {
            tokenName: name,
            priceUsd: values.usd ?? 0,
            priceEur: values.eur,
            change24h: values.usd_24h_change,
            timestamp: now,
          };
          this.cache.set(name, { price, expiresAt: now + this.cacheTtlMs });
          result.set(name, price);
        }
      }

      if (this.debug) {
        console.log(`[CoinGecko] Fetched ${result.size} prices`);
      }
    } catch (error) {
      if (this.debug) {
        console.warn('[CoinGecko] Fetch failed, using stale cache:', error);
      }

      // On error, return stale cached data if available
      for (const name of uncachedNames) {
        const stale = this.cache.get(name);
        if (stale) {
          result.set(name, stale.price);
        }
      }
    }

    return result;
  }

  async getPrice(tokenName: string): Promise<TokenPrice | null> {
    const prices = await this.getPrices([tokenName]);
    return prices.get(tokenName) ?? null;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
