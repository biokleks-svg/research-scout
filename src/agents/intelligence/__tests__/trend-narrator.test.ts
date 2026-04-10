import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/gemini', () => ({
  getProModel: vi.fn(() => ({
    generateContent: vi.fn().mockResolvedValue({
      response: { text: () => 'LLM tokenizer research is surging with three major papers this week.' },
    }),
  })),
}));
vi.mock('@/server/db', () => ({
  db: {
    query: {
      trends: { findMany: vi.fn().mockResolvedValue([]) },
    },
    select: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/server/db/schema', () => ({ trends: {}, contentItems: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { buildNarrativePrompt } from '../trend-narrator';
import type { TrendStatus } from '@/types/trends';

describe('buildNarrativePrompt', () => {
  it('includes the trend name', () => {
    const prompt = buildNarrativePrompt(
      'LLM Tokenizer Design', 'rising', 72,
      [{ title: 'BPE Alternatives', tldr: 'New tokenizer approach.' }],
    );
    expect(prompt).toContain('LLM Tokenizer Design');
  });

  it('includes the status description', () => {
    const prompt = buildNarrativePrompt('T', 'rising', 50, []);
    expect(prompt.toLowerCase()).toContain('rising');
  });

  it('includes paper titles', () => {
    const prompt = buildNarrativePrompt('T', 'emerging', 30, [
      { title: 'FlashAttention-3', tldr: 'Faster attention.' },
      { title: 'GQA for LLMs',    tldr: 'Grouped query attention.' },
    ]);
    expect(prompt).toContain('FlashAttention-3');
    expect(prompt).toContain('GQA for LLMs');
  });

  it('includes the momentum score', () => {
    const prompt = buildNarrativePrompt('T', 'peak', 88, []);
    expect(prompt).toContain('88');
  });

  it('requests plain text output (no JSON)', () => {
    const prompt = buildNarrativePrompt('T', 'emerging', 50, []);
    expect(prompt.toLowerCase()).not.toContain('json');
  });
});
