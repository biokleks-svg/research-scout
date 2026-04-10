import { describe, it, expect } from 'vitest';
import { buildHFContentHash, normalizeHFModel, type RawHFModel } from '../huggingface';

describe('buildHFContentHash', () => {
  it('returns stable 64-char hex', () => {
    const h = buildHFContentHash('mistralai/Mistral-7B-v0.1');
    expect(h).toHaveLength(64);
    expect(buildHFContentHash('mistralai/Mistral-7B-v0.1')).toBe(h);
  });
});

describe('normalizeHFModel', () => {
  const model: RawHFModel = {
    id:        'mistralai/Mistral-7B-v0.1',
    modelId:   'mistralai/Mistral-7B-v0.1',
    downloads: 1_500_000,
    likes:     3400,
    createdAt: '2023-09-27T00:00:00.000Z',
    tags:      ['transformers', 'pytorch', 'text-generation'],
  };

  it('sets sourceType to model', () => {
    expect(normalizeHFModel(model).sourceType).toBe('model');
  });

  it('sets sourceId to model id', () => {
    expect(normalizeHFModel(model).sourceId).toBe('mistralai/Mistral-7B-v0.1');
  });

  it('includes download count in rawText', () => {
    expect(normalizeHFModel(model).rawText).toContain('1500000');
  });

  it('uses downloads as citationCount proxy', () => {
    expect(normalizeHFModel(model).citationCount).toBe(1_500_000);
  });
});
