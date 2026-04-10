import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/gemini', () => ({
  getFlashModel: vi.fn(() => ({
    generateContent: vi.fn().mockResolvedValue({
      response: { text: () => 'This paper ranks highly due to its novel approach.' },
    }),
  })),
}));
vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock('@/server/db/schema', () => ({ contentItems: {}, processingRegistry: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}));
vi.mock('../rank-synthesizer', () => ({
  computeCompositeScore: vi.fn(() => 72),
}));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { buildAuditTrail, buildJustificationPrompt } from '../justification';
import type { RegistryStages } from '@/types/content';

const completeStages: RegistryStages = {
  harvested:    { done: true,  at: '2026-04-01T10:00:00Z' },
  classified:   { done: true,  at: '2026-04-01T10:05:00Z' },
  infographic:  { done: true,  at: '2026-04-01T10:10:00Z' },
  summary:      { done: true,  at: '2026-04-01T10:15:00Z' },
  podcast:      { done: false, at: '' },
  criticScored: { done: true,  at: '2026-04-01T11:00:00Z' },
  justified:    { done: false, at: '' },
};

describe('buildAuditTrail', () => {
  it('returns an entry for each completed stage', () => {
    const trail = buildAuditTrail(completeStages);
    expect(trail).toHaveLength(5); // harvested, classified, infographic, summary, criticScored
  });

  it('does not include incomplete stages', () => {
    const trail = buildAuditTrail(completeStages);
    const agents = trail.map(e => e.agent);
    expect(agents).not.toContain('Podcast Generator');
  });

  it('returns empty array for null stages', () => {
    expect(buildAuditTrail(null)).toEqual([]);
  });

  it('includes correct timestamps', () => {
    const trail = buildAuditTrail(completeStages);
    const harvested = trail.find(e => e.agent === 'Paper Harvester');
    expect(harvested?.timestamp).toBe('2026-04-01T10:00:00Z');
  });
});

describe('buildJustificationPrompt', () => {
  it('includes the paper title', () => {
    const prompt = buildJustificationPrompt(
      'Attention Is All You Need', 'nlp', '2026-W15', 85, 42,
      [{ title: 'BERT', composite: 90 }, { title: 'GPT-4', composite: 88 }],
    );
    expect(prompt).toContain('Attention Is All You Need');
  });

  it('includes cohort context', () => {
    const prompt = buildJustificationPrompt('P', 'nlp', '2026-W15', 85, 42, []);
    expect(prompt).toContain('42');
    expect(prompt).toContain('2026-W15');
  });

  it('includes top peer titles', () => {
    const prompt = buildJustificationPrompt('P', 'nlp', '2026-W15', 85, 10, [
      { title: 'Peer Paper A', composite: 90 },
    ]);
    expect(prompt).toContain('Peer Paper A');
  });
});
