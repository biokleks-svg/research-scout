import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  db: {
    execute: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    query: { trends: { findFirst: vi.fn() } },
  },
}));
vi.mock('@/server/db/schema', () => ({ trends: {}, contentItems: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    { raw: vi.fn() },
  ),
}));
vi.mock('@/lib/constants', () => ({
  TREND_Z_SCORE_EMERGING: 2.0,
  TREND_Z_SCORE_RISING:   3.5,
  TREND_Z_SCORE_FADING:   1.5,
  TREND_FADING_DAYS:      14,
  TREND_LOOKBACK_WEEKS:   12,
}));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { computeZScore, nextTrendStatus, categoryToSlug } from '../trend-detector';
import type { TrendStatus } from '@/types/trends';

describe('computeZScore', () => {
  it('returns 0 when fewer than 2 historical values', () => {
    expect(computeZScore(10, [5])).toBe(0);
    expect(computeZScore(10, [])).toBe(0);
  });

  it('returns 0 when stddev is 0 (all historical values identical)', () => {
    expect(computeZScore(5, [5, 5, 5, 5])).toBe(0);
  });

  it('returns positive z-score when current > mean', () => {
    const historical = [3, 4, 5, 6, 7]; // mean=5, stddev≈1.41
    const zScore = computeZScore(10, historical);
    expect(zScore).toBeGreaterThan(3);
  });

  it('returns negative z-score when current < mean', () => {
    const historical = [3, 4, 5, 6, 7]; // mean=5
    const zScore = computeZScore(1, historical);
    expect(zScore).toBeLessThan(0);
  });
});

describe('nextTrendStatus', () => {
  it('returns "rising" when z-score >= TREND_Z_SCORE_RISING (3.5)', () => {
    expect(nextTrendStatus(null, 4.0, null)).toBe('rising');
    expect(nextTrendStatus('emerging', 3.5, null)).toBe('rising');
  });

  it('returns "emerging" when z-score >= TREND_Z_SCORE_EMERGING and no prior status', () => {
    expect(nextTrendStatus(null, 2.5, null)).toBe('emerging');
  });

  it('returns "peak" when z-score in emerging range but previously "rising"', () => {
    expect(nextTrendStatus('rising', 2.5, 0)).toBe('peak');
  });

  it('returns "fading" when z-score below TREND_Z_SCORE_FADING and past TREND_FADING_DAYS at peak', () => {
    expect(nextTrendStatus('peak', 1.0, 15)).toBe('fading');
  });

  it('does not fade before TREND_FADING_DAYS have passed', () => {
    expect(nextTrendStatus('peak', 1.0, 5)).toBe('peak');
  });

  it('returns current status unchanged when no transition condition met', () => {
    expect(nextTrendStatus('emerging', 2.2, null)).toBe('emerging');
  });
});

describe('categoryToSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(categoryToSlug('Natural Language Processing')).toBe('natural-language-processing');
  });

  it('strips non-alphanumeric characters', () => {
    expect(categoryToSlug('CV & Robotics!')).toBe('cv--robotics');
  });
});
