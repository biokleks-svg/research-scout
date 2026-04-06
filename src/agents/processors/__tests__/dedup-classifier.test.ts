import { describe, it, expect } from 'vitest';
import { cosineSimilarity, inferPrimaryArea, inferDifficulty } from '../dedup-classifier';

describe('dedup-classifier', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 0, 0, 0];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    it('returns -1 for opposite vectors', () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    it('is symmetric', () => {
      const a = [0.3, 0.7, 0.1];
      const b = [0.9, 0.2, 0.5];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    });

    it('throws for mismatched lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('same length');
    });
  });

  describe('inferPrimaryArea', () => {
    it('detects NLP from transformer keywords', () => {
      expect(inferPrimaryArea('A new transformer architecture for language model fine-tuning')).toBe('NLP');
    });

    it('detects CV from image keywords', () => {
      expect(inferPrimaryArea('Image segmentation using convolutional diffusion models')).toBe('CV');
    });

    it('defaults to General AI when no strong signal', () => {
      expect(inferPrimaryArea('A new approach to machine learning optimization')).toBe('General AI');
    });
  });

  describe('inferDifficulty', () => {
    it('returns advanced for papers with theorem and proof', () => {
      expect(inferDifficulty('We prove convergence and provide a theorem with posterior bounds')).toBe('advanced');
    });

    it('returns beginner for survey/tutorial papers', () => {
      expect(inferDifficulty('An introduction and survey of recent advances')).toBe('beginner');
    });

    it('returns intermediate as default', () => {
      expect(inferDifficulty('We present a new method for classification')).toBe('intermediate');
    });
  });
});
