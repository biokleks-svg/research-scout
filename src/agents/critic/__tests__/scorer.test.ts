import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/gemini', () => ({
  getFlashModel: vi.fn(() => ({
    generateContent: vi.fn().mockResolvedValue({
      response: { text: () => '{}' },
    }),
  })),
}));
vi.mock('@/server/db', () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock('@/server/db/schema', () => ({ contentItems: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import {
  buildScorerPrompt,
  parseScorerResponse,
  computeWebBuzzScore,
  computeBasePopularity,
} from '../scorer';

describe('buildScorerPrompt', () => {
  it('includes title and text in the prompt', () => {
    const prompt = buildScorerPrompt('Test Paper', 'abstract here');
    expect(prompt).toContain('Test Paper');
    expect(prompt).toContain('abstract here');
  });

  it('asks for JSON output', () => {
    const prompt = buildScorerPrompt('P', 'T');
    expect(prompt.toLowerCase()).toContain('json');
  });

  it('truncates text to 6000 chars', () => {
    const longText = 'x'.repeat(10000);
    const prompt = buildScorerPrompt('P', longText);
    expect(prompt).toContain('x'.repeat(6000));
    expect(prompt).not.toContain('x'.repeat(6001));
  });
});

describe('parseScorerResponse', () => {
  const validRaw = JSON.stringify({
    aiNovelty:           { score: 72, reasoning: 'Novel approach.' },
    usefulness:          { score: 65, reasoning: 'Has code.' },
    methodologicalRigor: { score: 80, reasoning: 'Good ablations.' },
    reproducibility:     { score: 90, reasoning: 'Full code release.' },
    industryRelevance:   { score: 55, reasoning: 'Applied focus.' },
    longevityPotential:  { score: 60, reasoning: 'Opens new directions.' },
  });

  it('parses valid JSON into scorer output', () => {
    const result = parseScorerResponse(validRaw);
    expect(result.aiNovelty.score).toBe(72);
    expect(result.reproducibility.reasoning).toBe('Full code release.');
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n' + validRaw + '\n```';
    const result = parseScorerResponse(raw);
    expect(result.aiNovelty.score).toBe(72);
  });

  it('throws when a required field is missing', () => {
    expect(() => parseScorerResponse('{"aiNovelty":{"score":50,"reasoning":"x"}}')).toThrow();
  });

  it('throws when score is out of range', () => {
    const bad = JSON.stringify({
      aiNovelty:           { score: 150, reasoning: 'x' },
      usefulness:          { score: 50, reasoning: 'x' },
      methodologicalRigor: { score: 50, reasoning: 'x' },
      reproducibility:     { score: 50, reasoning: 'x' },
      industryRelevance:   { score: 50, reasoning: 'x' },
      longevityPotential:  { score: 50, reasoning: 'x' },
    });
    expect(() => parseScorerResponse(bad)).toThrow();
  });
});

describe('computeWebBuzzScore', () => {
  it('normalizes engagement 0-1 to 0-100', () => {
    expect(computeWebBuzzScore(0.5)).toBe(50);
    expect(computeWebBuzzScore(0)).toBe(0);
    expect(computeWebBuzzScore(1)).toBe(100);
  });

  it('caps at 100', () => {
    expect(computeWebBuzzScore(2)).toBe(100);
  });
});

describe('computeBasePopularity', () => {
  it('maps 1000 citations to 100', () => {
    expect(computeBasePopularity(1000)).toBe(100);
  });

  it('maps 500 citations to 50', () => {
    expect(computeBasePopularity(500)).toBe(50);
  });

  it('caps at 100', () => {
    expect(computeBasePopularity(5000)).toBe(100);
  });

  it('returns 0 for 0 citations', () => {
    expect(computeBasePopularity(0)).toBe(0);
  });
});
