import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock('@/server/db/schema', () => ({ contentItems: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));
vi.mock('@/lib/constants', () => ({
  CRITIC_DIMENSION_WEIGHTS: {
    aiNovelty: 0.20, usefulness: 0.15, methodologicalRigor: 0.10,
    reproducibility: 0.10, webBuzz: 0.15, popularity: 0.15,
    industryRelevance: 0.10, longevityPotential: 0.05,
  },
}));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import {
  getWeekId,
  getClusterId,
  computePercentile,
  computeCompositeScore,
} from '../rank-synthesizer';
import type { CriticScores } from '@/types/critic';

const mockScores: CriticScores = {
  aiNovelty:           { score: 80, reasoning: 'r' },
  usefulness:          { score: 70, reasoning: 'r' },
  methodologicalRigor: { score: 60, reasoning: 'r' },
  reproducibility:     { score: 90, reasoning: 'r' },
  webBuzz:             { score: 40, reasoning: 'r' },
  industryRelevance:   { score: 50, reasoning: 'r' },
  longevityPotential:  { score: 55, reasoning: 'r' },
  popularity:          { base: 30, trendBonus: 10, total: 40 },
};

describe('getWeekId', () => {
  it('returns ISO week format YYYY-WXX', () => {
    const result = getWeekId(new Date('2026-04-09'));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns the same week for dates in the same ISO week', () => {
    const mon = getWeekId(new Date('2026-04-06'));
    const thu = getWeekId(new Date('2026-04-09'));
    expect(mon).toBe(thu);
  });

  it('returns different weeks for dates in adjacent ISO weeks', () => {
    const week14 = getWeekId(new Date('2026-04-02'));
    const week15 = getWeekId(new Date('2026-04-09'));
    expect(week14).not.toBe(week15);
  });
});

describe('getClusterId', () => {
  it('slugifies the primaryArea', () => {
    expect(getClusterId({ primaryArea: 'Natural Language Processing', subAreas: [], taskTypes: [], applicationDomains: [] }))
      .toBe('natural-language-processing');
  });

  it('strips non-alphanumeric characters', () => {
    expect(getClusterId({ primaryArea: 'CV & Robotics!', subAreas: [], taskTypes: [], applicationDomains: [] }))
      .toBe('cv--robotics');
  });

  it('defaults to "general" when taxonomy is null', () => {
    expect(getClusterId(null)).toBe('general');
  });
});

describe('computePercentile', () => {
  it('returns 100 when value equals max in set', () => {
    expect(computePercentile(100, [20, 50, 80, 100])).toBe(100);
  });

  it('returns 25 for the lowest quartile value', () => {
    expect(computePercentile(20, [20, 50, 80, 100])).toBe(25);
  });

  it('returns 50 when no values', () => {
    expect(computePercentile(50, [])).toBe(50);
  });
});

describe('computeCompositeScore', () => {
  it('returns a number between 0 and 100', () => {
    const result = computeCompositeScore(mockScores);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('uses all 8 dimensions weighted correctly', () => {
    const allMax: CriticScores = {
      aiNovelty:           { score: 100, reasoning: 'r' },
      usefulness:          { score: 100, reasoning: 'r' },
      methodologicalRigor: { score: 100, reasoning: 'r' },
      reproducibility:     { score: 100, reasoning: 'r' },
      webBuzz:             { score: 100, reasoning: 'r' },
      industryRelevance:   { score: 100, reasoning: 'r' },
      longevityPotential:  { score: 100, reasoning: 'r' },
      popularity:          { base: 100, trendBonus: 0, total: 100 },
    };
    expect(computeCompositeScore(allMax)).toBe(100);
  });

  it('returns 0 when all scores are 0', () => {
    const allZero: CriticScores = {
      aiNovelty:           { score: 0, reasoning: 'r' },
      usefulness:          { score: 0, reasoning: 'r' },
      methodologicalRigor: { score: 0, reasoning: 'r' },
      reproducibility:     { score: 0, reasoning: 'r' },
      webBuzz:             { score: 0, reasoning: 'r' },
      industryRelevance:   { score: 0, reasoning: 'r' },
      longevityPotential:  { score: 0, reasoning: 'r' },
      popularity:          { base: 0, trendBonus: 0, total: 0 },
    };
    expect(computeCompositeScore(allZero)).toBe(0);
  });
});
