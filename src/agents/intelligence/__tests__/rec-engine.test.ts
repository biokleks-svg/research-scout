import { describe, it, expect } from 'vitest';
import { computeFreshnessScore, scoreCandidate } from '../rec-engine';

describe('computeFreshnessScore', () => {
  it('returns 1.0 for a just-published item', () => {
    const score = computeFreshnessScore(new Date());
    expect(score).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.37 for an item published 7 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const score = computeFreshnessScore(d);
    expect(score).toBeCloseTo(0.368, 1); // e^(-1) ≈ 0.368
  });

  it('returns lower score for older items', () => {
    const recent = new Date();
    const old    = new Date();
    old.setDate(old.getDate() - 30);
    expect(computeFreshnessScore(recent)).toBeGreaterThan(computeFreshnessScore(old));
  });
});

describe('scoreCandidate', () => {
  it('returns a number between 0 and 1', () => {
    const score = scoreCandidate({
      similarity:    0.85,
      globalQuality: 75,
      publishedAt:   new Date(),
      trendIdsCount: 2,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores higher-relevance items above lower ones', () => {
    const base = { globalQuality: 50, publishedAt: new Date(), trendIdsCount: 0 };
    const highRel = scoreCandidate({ ...base, similarity: 0.9 });
    const lowRel  = scoreCandidate({ ...base, similarity: 0.3 });
    expect(highRel).toBeGreaterThan(lowRel);
  });

  it('scores higher-quality items above lower ones at same relevance', () => {
    const base = { similarity: 0.7, publishedAt: new Date(), trendIdsCount: 0 };
    const highQ = scoreCandidate({ ...base, globalQuality: 90 });
    const lowQ  = scoreCandidate({ ...base, globalQuality: 10 });
    expect(highQ).toBeGreaterThan(lowQ);
  });

  it('scores trending items above non-trending at same relevance + quality', () => {
    const base = { similarity: 0.7, globalQuality: 60, publishedAt: new Date() };
    const trending    = scoreCandidate({ ...base, trendIdsCount: 3 });
    const nonTrending = scoreCandidate({ ...base, trendIdsCount: 0 });
    expect(trending).toBeGreaterThan(nonTrending);
  });
});
