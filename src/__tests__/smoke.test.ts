import { describe, it, expect } from 'vitest';
import { normalizeArxivEntry, buildArxivUrl } from '@/agents/harvesters/paper';
import type { ArxivEntry } from '@/agents/harvesters/paper';
import { cosineSimilarity, inferPrimaryArea, inferDifficulty } from '@/agents/processors/dedup-classifier';

describe('Phase 1 smoke tests', () => {
  describe('arXiv harvester', () => {
    it('buildArxivUrl is well-formed', () => {
      const url = buildArxivUrl(5, 0);
      expect(url).toMatch(/^https:\/\/export\.arxiv\.org\/api\/query\?/);
      expect(url).toContain('max_results=5');
      expect(url).toContain('cs.AI');
      expect(url).toContain('sortBy=submittedDate');
    });

    it('full normalizeArxivEntry → inferPrimaryArea pipeline', () => {
      const fakeEntry: ArxivEntry = {
        id: ['http://arxiv.org/abs/2401.99999v1'],
        title: ['Attention Is All You Need for Language Models'],
        author: [{ name: ['Alice'] }, { name: ['Bob'] }],
        summary: ['We propose a new transformer architecture for NLP language model fine-tuning tasks.'],
        published: ['2024-01-15T00:00:00Z'],
        link: [{ $: { href: 'http://arxiv.org/abs/2401.99999', rel: 'alternate' } }],
      };
      const paper = normalizeArxivEntry(fakeEntry);
      const area = inferPrimaryArea(`${paper.title} ${paper.rawText}`);
      const difficulty = inferDifficulty(`${paper.title} ${paper.rawText}`);

      expect(paper.sourceId).toBe('2401.99999');
      expect(paper.sourceType).toBe('paper');
      expect(area).toBe('NLP');
      expect(['beginner', 'intermediate', 'advanced']).toContain(difficulty);
    });

    it('contentHash is stable across calls', () => {
      const fakeEntry: ArxivEntry = {
        id: ['http://arxiv.org/abs/2401.12345v2'],
        title: ['Stable Hash Paper'],
        author: [{ name: ['Alice'] }],
        summary: ['Abstract text here.'],
        published: ['2024-01-01T00:00:00Z'],
        link: [{ $: { href: 'http://arxiv.org/abs/2401.12345', rel: 'alternate' } }],
      };
      expect(normalizeArxivEntry(fakeEntry).contentHash)
        .toBe(normalizeArxivEntry(fakeEntry).contentHash);
    });
  });

  describe('dedup-classifier', () => {
    it('cosineSimilarity is symmetric', () => {
      const a = [0.1, 0.9, 0.3];
      const b = [0.5, 0.2, 0.7];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    });

    it('DEDUP_SIMILARITY_THRESHOLD semantics: identical text would score 1.0', () => {
      const v = [1, 0, 0, 0, 0];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
      // A 0.92 threshold means we'd mark this as a duplicate
      expect(cosineSimilarity(v, v)).toBeGreaterThan(0.92);
    });

    it('CV paper is classified correctly', () => {
      const text = 'Image segmentation using convolutional diffusion models for visual detection';
      expect(inferPrimaryArea(text)).toBe('CV');
    });

    it('Advanced ML theory paper is classified as advanced', () => {
      const text = 'We prove convergence theorem with posterior bounds and manifold assumptions';
      expect(inferDifficulty(text)).toBe('advanced');
    });
  });
});
