import { describe, it, expect } from 'vitest';
import { normalizeArxivEntry, buildArxivUrl } from '../paper';
import type { ArxivEntry } from '../paper';

describe('arXiv harvester', () => {
  it('buildArxivUrl includes all categories', () => {
    const url = buildArxivUrl(10, 0);
    expect(url).toContain('cs.AI');
    expect(url).toContain('cs.LG');
    expect(url).toContain('max_results=10');
    expect(url).toContain('sortBy=submittedDate');
  });

  it('normalizeArxivEntry extracts title and authors', () => {
    const fakeEntry: ArxivEntry = {
      id: ['http://arxiv.org/abs/2401.00001v1'],
      title: ['  Test Paper Title  '],
      author: [{ name: ['Alice Smith'] }, { name: ['Bob Jones'] }],
      summary: ['This is the abstract.'],
      published: ['2024-01-01T00:00:00Z'],
      link: [
        { $: { href: 'http://arxiv.org/abs/2401.00001', rel: 'alternate' } },
      ],
    };
    const result = normalizeArxivEntry(fakeEntry);
    expect(result.title).toBe('Test Paper Title');
    expect(result.authors).toEqual(['Alice Smith', 'Bob Jones']);
    expect(result.sourceId).toBe('2401.00001');
    expect(result.sourceType).toBe('paper');
    expect(result.sourceUrl).toBe('http://arxiv.org/abs/2401.00001');
  });

  it('normalizeArxivEntry strips version suffix from arXiv ID', () => {
    const fakeEntry: ArxivEntry = {
      id: ['http://arxiv.org/abs/2312.99999v3'],
      title: ['Another Paper'],
      author: [{ name: ['Charlie'] }],
      summary: ['Abstract text.'],
      published: ['2023-12-01T00:00:00Z'],
      link: [{ $: { href: 'http://arxiv.org/abs/2312.99999', rel: 'alternate' } }],
    };
    const result = normalizeArxivEntry(fakeEntry);
    expect(result.sourceId).toBe('2312.99999');
  });

  it('normalizeArxivEntry generates deterministic contentHash', () => {
    const fakeEntry: ArxivEntry = {
      id: ['http://arxiv.org/abs/2401.00001v1'],
      title: ['Same Title'],
      author: [{ name: ['Alice'] }],
      summary: ['Abstract'],
      published: ['2024-01-01T00:00:00Z'],
      link: [{ $: { href: 'http://arxiv.org/abs/2401.00001', rel: 'alternate' } }],
    };
    const r1 = normalizeArxivEntry(fakeEntry);
    const r2 = normalizeArxivEntry(fakeEntry);
    expect(r1.contentHash).toBe(r2.contentHash);
    expect(r1.contentHash).toHaveLength(64); // SHA-256 hex
  });
});
