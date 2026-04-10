import { describe, it, expect } from 'vitest';
import {
  ARXIV_CATEGORIES, DEDUP_SIMILARITY_THRESHOLD, EMBEDDING_DIMENSIONS,
  QUEUE_HARVEST, QUEUE_PROCESS, DEFAULT_FEED_LIMIT,
  HF_API_BASE, BLUESKY_API_BASE, HN_API_BASE,
  REC_ENGINE_WINDOW_DAYS, REC_ENGINE_CANDIDATE_LIMIT, REC_ENGINE_OUTPUT_LIMIT,
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

  it('has HF_API_BASE', () => {
    expect(HF_API_BASE).toBe('https://huggingface.co/api');
  });

  it('has BLUESKY_API_BASE', () => {
    expect(BLUESKY_API_BASE).toBe('https://public.api.bsky.app');
  });

  it('has HN_API_BASE', () => {
    expect(HN_API_BASE).toBe('https://hn.algolia.com/api/v1');
  });

  it('has REC_ENGINE_WINDOW_DAYS', () => {
    expect(REC_ENGINE_WINDOW_DAYS).toBe(21);
  });

  it('has REC_ENGINE_CANDIDATE_LIMIT', () => {
    expect(REC_ENGINE_CANDIDATE_LIMIT).toBe(200);
  });

  it('has REC_ENGINE_OUTPUT_LIMIT', () => {
    expect(REC_ENGINE_OUTPUT_LIMIT).toBe(20);
  });
});
