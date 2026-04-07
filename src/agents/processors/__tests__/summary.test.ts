import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/gemini', () => ({
  getFlashModel: vi.fn(() => ({
    generateContent: vi.fn().mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          tldr: 'Test TLDR.',
          problem: 'Test problem.',
          keyInsight: 'Test insight.',
          results: 'Test results.',
          limitations: 'Test limitations.',
          whyItMatters: 'Test importance.',
          practicalTakeaway: 'Test takeaway.',
          difficulty: 'intermediate',
          wordCount: 450,
        }),
      },
    }),
  })),
}));

vi.mock('@/server/db', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 'test-id',
            title: 'Test Paper',
            rawText: 'Abstract text here.',
            summary: null,
          }]),
        }),
      }),
    }),
  },
}));

vi.mock('@/server/db/schema', () => ({
  contentItems: {},
  processingRegistry: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

vi.mock('pino', () => ({
  pino: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { buildSummaryPrompt, parseSummaryResponse } from '../summary';

describe('buildSummaryPrompt', () => {
  it('includes title and text in the prompt', () => {
    const prompt = buildSummaryPrompt('My Paper', 'abstract text here');
    expect(prompt).toContain('My Paper');
    expect(prompt).toContain('abstract text here');
  });

  it('requests JSON output', () => {
    const prompt = buildSummaryPrompt('P', 'T');
    expect(prompt.toLowerCase()).toContain('json');
  });
});

describe('parseSummaryResponse', () => {
  it('parses valid JSON into SummarySchema', () => {
    const raw = JSON.stringify({
      tldr: 'Short.',
      problem: 'P.',
      keyInsight: 'K.',
      results: 'R.',
      limitations: 'L.',
      whyItMatters: 'W.',
      practicalTakeaway: 'T.',
      difficulty: 'advanced',
      wordCount: 500,
    });
    const result = parseSummaryResponse(raw);
    expect(result.tldr).toBe('Short.');
    expect(result.difficulty).toBe('advanced');
    expect(result.wordCount).toBe(500);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"tldr":"A","problem":"B","keyInsight":"C","results":"D","limitations":"E","whyItMatters":"F","practicalTakeaway":"G","difficulty":"beginner","wordCount":100}\n```';
    const result = parseSummaryResponse(raw);
    expect(result.tldr).toBe('A');
  });

  it('throws on invalid schema', () => {
    expect(() => parseSummaryResponse('{"tldr":"only field"}')).toThrow();
  });
});
