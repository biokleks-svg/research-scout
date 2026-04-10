import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  db: {
    query: {
      trends: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/server/db/schema', () => ({ contentItems: {}, trends: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));
vi.mock('@/lib/constants', () => ({ TREND_INHERITANCE_FACTOR: 0.3 }));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { computeTrendBonus } from '../trend-propagator';

describe('computeTrendBonus', () => {
  it('multiplies momentumScore by TREND_INHERITANCE_FACTOR', () => {
    expect(computeTrendBonus(100)).toBe(30);
    expect(computeTrendBonus(50)).toBe(15);
  });

  it('rounds to integer', () => {
    expect(computeTrendBonus(33)).toBe(10); // 33 * 0.3 = 9.9 → rounds to 10
  });

  it('handles zero', () => {
    expect(computeTrendBonus(0)).toBe(0);
  });
});
