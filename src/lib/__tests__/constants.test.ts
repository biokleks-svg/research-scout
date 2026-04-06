import { describe, it, expect } from 'vitest';
import {
  ARXIV_CATEGORIES, DEDUP_SIMILARITY_THRESHOLD, EMBEDDING_DIMENSIONS,
  QUEUE_HARVEST, QUEUE_PROCESS, DEFAULT_FEED_LIMIT,
} from '../constants';

describe('constants', () => {
  it('ARXIV_CATEGORIES has 4 categories', () => {
    expect(ARXIV_CATEGORIES).toHaveLength(4);
    expect(ARXIV_CATEGORIES).toContain('cs.AI');
  });

  it('DEDUP_SIMILARITY_THRESHOLD is between 0 and 1', () => {
    expect(DEDUP_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(DEDUP_SIMILARITY_THRESHOLD).toBeLessThan(1);
  });

  it('EMBEDDING_DIMENSIONS is 768', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });

  it('queue names are defined', () => {
    expect(QUEUE_HARVEST).toBe('harvest');
    expect(QUEUE_PROCESS).toBe('process');
  });
});
