import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agents/critic/scorer',          () => ({ scoreContentItem:    vi.fn().mockResolvedValue(true) }));
vi.mock('@/agents/critic/rank-synthesizer',() => ({ synthesizeCohortRank: vi.fn().mockResolvedValue(true) }));
vi.mock('@/agents/critic/justification',   () => ({ generateJustification: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/queue',     () => ({ getRedisConnection: vi.fn(() => ({})) }));
vi.mock('@/lib/constants', () => ({ QUEUE_CRITIC: 'critic' }));
vi.mock('bullmq', () => {
  class MockWorker {
    on = vi.fn();
  }
  return {
    Worker: MockWorker,
  };
});
vi.mock('pino',   () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { criticStage } from '../critic';

describe('criticStage', () => {
  it('calls scoreContentItem for stage "score"', async () => {
    const { scoreContentItem } = await import('@/agents/critic/scorer');
    const result = await criticStage('item-1', 'score');
    expect(scoreContentItem).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('calls synthesizeCohortRank for stage "rank"', async () => {
    const { synthesizeCohortRank } = await import('@/agents/critic/rank-synthesizer');
    const result = await criticStage('item-1', 'rank');
    expect(synthesizeCohortRank).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('calls generateJustification for stage "justify"', async () => {
    const { generateJustification } = await import('@/agents/critic/justification');
    const result = await criticStage('item-1', 'justify');
    expect(generateJustification).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('returns false for unknown stage', async () => {
    const result = await criticStage('item-1', 'unknown' as 'score');
    expect(result).toBe(false);
  });
});
