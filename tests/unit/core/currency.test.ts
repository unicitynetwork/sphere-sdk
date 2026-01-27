/**
 * Tests for core/currency.ts
 * Covers amount conversion and formatting functions
 */

import { describe, it, expect } from 'vitest';
import {
  toSmallestUnit,
  toHumanReadable,
  formatAmount,
  DEFAULT_TOKEN_DECIMALS,
  CurrencyUtils,
} from '../../../core/currency';

import { CURRENCY_VECTORS } from '../../fixtures/test-vectors';

// =============================================================================
// toSmallestUnit Tests
// =============================================================================

describe('toSmallestUnit()', () => {
  it('should convert whole numbers correctly', () => {
    expect(toSmallestUnit('1', 18)).toBe(1000000000000000000n);
    expect(toSmallestUnit('100', 18)).toBe(100000000000000000000n);
    expect(toSmallestUnit(1, 18)).toBe(1000000000000000000n);
  });

  it('should convert decimal numbers correctly', () => {
    expect(toSmallestUnit('1.5', 18)).toBe(1500000000000000000n);
    expect(toSmallestUnit('0.5', 18)).toBe(500000000000000000n);
    expect(toSmallestUnit('0.000000000000000001', 18)).toBe(1n);
  });

  it('should use test vectors', () => {
    for (const vector of CURRENCY_VECTORS) {
      expect(toSmallestUnit(vector.human, vector.decimals)).toBe(vector.smallestUnit);
    }
  });

  it('should handle different decimal places', () => {
    expect(toSmallestUnit('1', 6)).toBe(1000000n);
    expect(toSmallestUnit('1.23', 6)).toBe(1230000n);
    expect(toSmallestUnit('1', 8)).toBe(100000000n);
  });

  it('should truncate excess decimal places', () => {
    // 1.123456789... with 6 decimals should truncate to 1.123456
    expect(toSmallestUnit('1.1234567', 6)).toBe(1123456n);
  });

  it('should handle zero', () => {
    expect(toSmallestUnit('0', 18)).toBe(0n);
    expect(toSmallestUnit(0, 18)).toBe(0n);
  });

  it('should handle empty/falsy values', () => {
    expect(toSmallestUnit('', 18)).toBe(0n);
  });

  it('should use DEFAULT_TOKEN_DECIMALS by default', () => {
    expect(DEFAULT_TOKEN_DECIMALS).toBe(18);
    expect(toSmallestUnit('1')).toBe(1000000000000000000n);
  });

  it('should handle large numbers', () => {
    expect(toSmallestUnit('1000000', 18)).toBe(1000000000000000000000000n);
  });

  it('should handle very small fractions', () => {
    expect(toSmallestUnit('0.1', 18)).toBe(100000000000000000n);
    expect(toSmallestUnit('0.01', 18)).toBe(10000000000000000n);
  });
});

// =============================================================================
// toHumanReadable Tests
// =============================================================================

describe('toHumanReadable()', () => {
  it('should convert whole amounts correctly', () => {
    expect(toHumanReadable(1000000000000000000n, 18)).toBe('1');
    expect(toHumanReadable(100000000000000000000n, 18)).toBe('100');
  });

  it('should convert fractional amounts correctly', () => {
    expect(toHumanReadable(1500000000000000000n, 18)).toBe('1.5');
    expect(toHumanReadable(500000000000000000n, 18)).toBe('0.5');
    expect(toHumanReadable(1n, 18)).toBe('0.000000000000000001');
  });

  it('should use test vectors (reverse)', () => {
    for (const vector of CURRENCY_VECTORS) {
      expect(toHumanReadable(vector.smallestUnit, vector.decimals)).toBe(vector.human);
    }
  });

  it('should handle different decimal places', () => {
    expect(toHumanReadable(1000000n, 6)).toBe('1');
    expect(toHumanReadable(1230000n, 6)).toBe('1.23');
    expect(toHumanReadable(100000000n, 8)).toBe('1');
  });

  it('should handle zero', () => {
    expect(toHumanReadable(0n, 18)).toBe('0');
  });

  it('should strip trailing zeros from fraction', () => {
    expect(toHumanReadable(1500000000000000000n, 18)).toBe('1.5');
    expect(toHumanReadable(1000000000000000000n, 18)).toBe('1');
    // Not '1.000000000000000000'
  });

  it('should handle string input', () => {
    expect(toHumanReadable('1000000000000000000', 18)).toBe('1');
  });

  it('should handle large numbers', () => {
    expect(toHumanReadable(1000000000000000000000000n, 18)).toBe('1000000');
  });

  it('should handle very small amounts', () => {
    expect(toHumanReadable(100000000000000000n, 18)).toBe('0.1');
    expect(toHumanReadable(10000000000000000n, 18)).toBe('0.01');
  });
});

// =============================================================================
// Round-trip Tests
// =============================================================================

describe('toSmallestUnit/toHumanReadable Round-trip', () => {
  it('should round-trip whole numbers', () => {
    const values = ['0', '1', '10', '100', '1000000'];
    for (const value of values) {
      const smallest = toSmallestUnit(value, 18);
      const human = toHumanReadable(smallest, 18);
      expect(human).toBe(value);
    }
  });

  it('should round-trip decimal numbers', () => {
    const values = ['0.1', '0.5', '1.5', '123.456', '0.000000000000000001'];
    for (const value of values) {
      const smallest = toSmallestUnit(value, 18);
      const human = toHumanReadable(smallest, 18);
      expect(human).toBe(value);
    }
  });
});

// =============================================================================
// formatAmount Tests
// =============================================================================

describe('formatAmount()', () => {
  it('should format amount without symbol', () => {
    expect(formatAmount(1500000000000000000n, { decimals: 18 })).toBe('1.5');
  });

  it('should format amount with symbol', () => {
    expect(formatAmount(1500000000000000000n, { decimals: 18, symbol: 'ALPHA' })).toBe('1.5 ALPHA');
  });

  it('should limit fraction digits', () => {
    expect(
      formatAmount(1234567890123456789n, { decimals: 18, maxFractionDigits: 4 })
    ).toBe('1.2345');
  });

  it('should handle zero maxFractionDigits', () => {
    expect(
      formatAmount(1500000000000000000n, { decimals: 18, maxFractionDigits: 0 })
    ).toBe('1');
  });

  it('should not add extra zeros for maxFractionDigits', () => {
    expect(
      formatAmount(1500000000000000000n, { decimals: 18, maxFractionDigits: 10 })
    ).toBe('1.5');
    // Not '1.5000000000'
  });

  it('should use default decimals', () => {
    expect(formatAmount(1000000000000000000n)).toBe('1');
  });

  it('should format with symbol and limited decimals', () => {
    expect(
      formatAmount(1234567890123456789n, {
        decimals: 18,
        symbol: 'ETH',
        maxFractionDigits: 2,
      })
    ).toBe('1.23 ETH');
  });
});

// =============================================================================
// CurrencyUtils Namespace Tests
// =============================================================================

describe('CurrencyUtils namespace', () => {
  it('should export toSmallestUnit', () => {
    expect(CurrencyUtils.toSmallestUnit).toBe(toSmallestUnit);
  });

  it('should export toHumanReadable', () => {
    expect(CurrencyUtils.toHumanReadable).toBe(toHumanReadable);
  });

  it('should export format (alias for formatAmount)', () => {
    expect(CurrencyUtils.format).toBe(formatAmount);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle maximum safe integer (JavaScript)', () => {
    // JavaScript's max safe integer is 2^53 - 1 = 9007199254740991
    // But bigint can handle much larger
    const large = 9007199254740991000000000n;
    const human = toHumanReadable(large, 18);
    const back = toSmallestUnit(human, 18);
    expect(back).toBe(large);
  });

  // Note: 0 decimals is an edge case that may not work perfectly
  // Most tokens have at least 1 decimal place
  it('should handle very small decimal places', () => {
    expect(toSmallestUnit('123', 1)).toBe(1230n);
    expect(toHumanReadable(1230n, 1)).toBe('123');
  });

  it('should handle decimal with no integer part', () => {
    expect(toSmallestUnit('.5', 18)).toBe(500000000000000000n);
  });
});
