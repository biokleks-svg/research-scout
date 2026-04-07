import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agents/processors/dedup-classifier', () => ({
  classifyContentItem: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/agents/processors/summary', () => ({
  writeSummary: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/agents/processors/infographic', () => ({
  generateInfographic: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/queue', () => ({
  getRedisConnection: vi.fn(() => ({})),
}));
vi.mock('@/lib/constants', () => ({
  QUEUE_PROCESS: 'process',
}));
vi.mock('bullmq', () => ({
  Worker: class {
    on = vi.fn();
    constructor(_queue: string, _handler: unknown, _opts: unknown) {}
  },
}));
vi.mock('pino', () => ({
  pino: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

import { processStage } from '../process';
import { writeSummary } from '@/agents/processors/summary';
import { generateInfographic } from '@/agents/processors/infographic';
import { classifyContentItem } from '@/agents/processors/dedup-classifier';

describe('processStage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls classifyContentItem for classify stage', async () => {
    const result = await processStage('item-1', 'classify');
    expect(classifyContentItem).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('calls writeSummary for summary stage', async () => {
    const result = await processStage('item-1', 'summary');
    expect(writeSummary).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('calls generateInfographic for infographic stage', async () => {
    const result = await processStage('item-1', 'infographic');
    expect(generateInfographic).toHaveBeenCalledWith('item-1');
    expect(result).toBe(true);
  });

  it('returns false for unknown stage', async () => {
    const result = await processStage('item-1', 'unknown' as any);
    expect(result).toBe(false);
  });
});
