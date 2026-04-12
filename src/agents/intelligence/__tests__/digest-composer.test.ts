import { describe, it, expect, vi } from 'vitest';

// Mocks needed because digest-composer.ts now imports DB dependencies.
vi.mock('@/server/db', () => ({
  db: {
    select:  vi.fn().mockReturnThis(),
    from:    vi.fn().mockReturnThis(),
    where:   vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  },
}));
vi.mock('@/server/db/schema', () => ({ areaForecasts: {} }));
vi.mock('drizzle-orm', () => ({ sql: vi.fn(), isNotNull: vi.fn() }));
vi.mock('@/agents/intelligence/rec-engine', () => ({
  buildRecommendations: vi.fn().mockResolvedValue([]),
}));

import { groupByTopic, formatDigestItem, formatRisingTopics, type DigestItem } from '../digest-composer';
import type { AreaForecast } from '@/types/trends';

describe('groupByTopic', () => {
  const items: DigestItem[] = [
    { id: '1', title: 'Paper A', sourceUrl: 'https://a.com', taxonomy: { primaryArea: 'NLP', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.9, summary: null },
    { id: '2', title: 'Paper B', sourceUrl: 'https://b.com', taxonomy: { primaryArea: 'NLP', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.8, summary: null },
    { id: '3', title: 'Model C', sourceUrl: 'https://c.com', taxonomy: { primaryArea: 'Computer Vision', subAreas: [], taskTypes: [], applicationDomains: [] }, score: 0.7, summary: null },
  ];

  it('groups by primaryArea', () => {
    const grouped = groupByTopic(items);
    expect(grouped.get('NLP')?.length).toBe(2);
    expect(grouped.get('Computer Vision')?.length).toBe(1);
  });

  it('falls back to General for items with no taxonomy', () => {
    const noTax: DigestItem = { id: '4', title: 'X', sourceUrl: 'x', taxonomy: null, score: 0.5, summary: null };
    const grouped = groupByTopic([noTax]);
    expect(grouped.has('General')).toBe(true);
  });
});

describe('formatDigestItem', () => {
  it('returns a string with the title', () => {
    const item: DigestItem = { id: '1', title: 'New Paper', sourceUrl: 'https://x.com', taxonomy: null, score: 0.8, summary: null };
    const formatted = formatDigestItem(item);
    expect(formatted).toContain('New Paper');
    expect(formatted).toContain('https://x.com');
  });

  it('includes tldr when summary is present', () => {
    const item: DigestItem = {
      id: '1', title: 'Paper', sourceUrl: 'https://x.com', taxonomy: null, score: 0.8,
      summary: { tldr: 'Short summary', problem: '', keyInsight: '', results: '', limitations: '', whyItMatters: '', practicalTakeaway: '', difficulty: 'intermediate', wordCount: 10 },
    };
    expect(formatDigestItem(item)).toContain('Short summary');
  });
});

describe('formatRisingTopics', () => {
  it('returns a Rising Topics markdown section for top 3 forecasts', () => {
    const forecasts: AreaForecast[] = [
      {
        id: '1', taxonomyArea: 'Computer Vision', forecastDate: new Date(), createdAt: new Date(),
        signals: { clusterGrowthRate: [], citationVelocity: [], engagementTrend: [], harvestVolume: [] },
        prediction: { growthPercent: 67, confidence: 'high', horizon: '6mo' },
        narrative: 'Vision-language models are accelerating rapidly.',
      },
      {
        id: '2', taxonomyArea: 'Reinforcement Learning', forecastDate: new Date(), createdAt: new Date(),
        signals: { clusterGrowthRate: [], citationVelocity: [], engagementTrend: [], harvestVolume: [] },
        prediction: { growthPercent: 41, confidence: 'medium', horizon: '6mo' },
        narrative: 'RL from human feedback is gaining traction.',
      },
      {
        id: '3', taxonomyArea: 'Graph Neural Networks', forecastDate: new Date(), createdAt: new Date(),
        signals: { clusterGrowthRate: [], citationVelocity: [], engagementTrend: [], harvestVolume: [] },
        prediction: { growthPercent: 28, confidence: 'low', horizon: '6mo' },
        narrative: 'GNNs are slowly growing in molecular applications.',
      },
    ];
    const section = formatRisingTopics(forecasts);
    expect(section).toContain('Rising Topics');
    expect(section).toContain('Computer Vision');
    expect(section).toContain('+67.0%');
    expect(section).toContain('high confidence');
    expect(section).toContain('Vision-language models');
  });

  it('returns empty string when given no forecasts', () => {
    expect(formatRisingTopics([])).toBe('');
  });
});
