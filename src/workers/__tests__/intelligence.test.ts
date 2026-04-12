import { describe, it, expect, vi } from 'vitest';

vi.mock('@/agents/intelligence/trend-detector',   () => ({ detectTrends:            vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/agents/intelligence/trend-narrator',   () => ({ narrateActiveTrends:      vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/agents/intelligence/trend-propagator', () => ({ propagateAllActiveTrends: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/agents/intelligence/rec-engine',       () => ({ buildRecommendations:     vi.fn().mockResolvedValue([]) }));
vi.mock('@/agents/intelligence/digest-composer',  () => ({ composeDigestForAllUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/agents/intelligence/area-forecaster', () => ({
  runAreaForecasts: vi.fn().mockResolvedValue(5),
}));
vi.mock('@/server/db/schema', () => ({ users: {} }));
vi.mock('drizzle-orm',        () => ({ isNotNull: vi.fn() }));
vi.mock('@/server/db',        () => ({ db: { query: { users: { findMany: vi.fn().mockResolvedValue([]) } } } }));
vi.mock('@/lib/queue',     () => ({ getRedisConnection: vi.fn(() => ({})) }));
vi.mock('@/lib/constants', () => ({ QUEUE_INTELLIGENCE: 'intelligence' }));
vi.mock('bullmq', () => {
  class MockWorker {
    on = vi.fn();
  }
  return {
    Worker: MockWorker,
  };
});
vi.mock('pino',   () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { intelligenceJob } from '../intelligence';

describe('intelligenceJob', () => {
  it('calls detectTrends + propagateAllActiveTrends for "detect-trends"', async () => {
    const { detectTrends }            = await import('@/agents/intelligence/trend-detector');
    const { propagateAllActiveTrends } = await import('@/agents/intelligence/trend-propagator');
    const result = await intelligenceJob('detect-trends');
    expect(detectTrends).toHaveBeenCalled();
    expect(propagateAllActiveTrends).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('calls narrateActiveTrends for "narrate-trends"', async () => {
    const { narrateActiveTrends } = await import('@/agents/intelligence/trend-narrator');
    const result = await intelligenceJob('narrate-trends');
    expect(narrateActiveTrends).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns true (stub) for "build-recommendations"', async () => {
    expect(await intelligenceJob('build-recommendations')).toBe(true);
  });

  it('returns true (stub) for "compose-digest"', async () => {
    expect(await intelligenceJob('compose-digest')).toBe(true);
  });

  it('calls runAreaForecasts for "run-area-forecasts"', async () => {
    const { runAreaForecasts } = await import('@/agents/intelligence/area-forecaster');
    const result = await intelligenceJob('run-area-forecasts');
    expect(runAreaForecasts).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
