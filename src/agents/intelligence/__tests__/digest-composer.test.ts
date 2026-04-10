import { describe, it, expect } from 'vitest';
import { groupByTopic, formatDigestItem, type DigestItem } from '../digest-composer';

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
