import { describe, it, expect } from 'vitest';
import type { SummarySchema } from '../content';
import type { CriticScores } from '../critic';

describe('types', () => {
  it('SummarySchema difficulty is a union literal', () => {
    const difficulties: SummarySchema['difficulty'][] = ['beginner', 'intermediate', 'advanced'];
    expect(difficulties).toHaveLength(3);
  });

  it('CriticScores has 8 dimensions', () => {
    const keys: (keyof CriticScores)[] = [
      'aiNovelty', 'usefulness', 'methodologicalRigor', 'reproducibility',
      'webBuzz', 'popularity', 'industryRelevance', 'longevityPotential',
    ];
    expect(keys).toHaveLength(8);
  });
});
