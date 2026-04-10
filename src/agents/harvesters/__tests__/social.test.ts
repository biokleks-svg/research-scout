import { describe, it, expect } from 'vitest';
import { buildSocialContentHash, normalizeBlueskyPost, normalizeHNItem } from '../social';
import type { RawBlueskyPost, RawHNItem } from '../social';

describe('buildSocialContentHash', () => {
  it('produces a stable hash', () => {
    const h = buildSocialContentHash('bluesky', 'at://abc/123');
    expect(h).toHaveLength(64);
    expect(buildSocialContentHash('bluesky', 'at://abc/123')).toBe(h);
  });
});

describe('normalizeBlueskyPost', () => {
  const post: RawBlueskyPost = {
    uri:    'at://did:plc:abc123/app.bsky.feed.post/xyz',
    cid:    'bafyabc',
    author: { handle: 'karpathy.bsky.social', displayName: 'Andrej Karpathy' },
    record: { text: 'Excited about this new LLM paper!', createdAt: '2024-01-15T12:00:00.000Z' },
    likeCount:   200,
    repostCount: 50,
  };

  it('sets sourceType to tweet', () => {
    expect(normalizeBlueskyPost(post).sourceType).toBe('tweet');
  });

  it('uses uri as sourceId', () => {
    expect(normalizeBlueskyPost(post).sourceId).toBe(post.uri);
  });

  it('puts post text in rawText', () => {
    expect(normalizeBlueskyPost(post).rawText).toContain('Excited about this new LLM paper!');
  });
});

describe('normalizeHNItem', () => {
  const item: RawHNItem = {
    objectID: '39264',
    title:    'Show HN: Open-source LLM fine-tuning',
    url:      'https://github.com/example/llm-tuning',
    author:   'pg',
    created_at: '2024-01-15T10:00:00.000Z',
    points:   300,
    num_comments: 45,
  };

  it('sets sourceType to social', () => {
    expect(normalizeHNItem(item).sourceType).toBe('social');
  });

  it('uses objectID as sourceId', () => {
    expect(normalizeHNItem(item).sourceId).toBe('hn:39264');
  });

  it('includes title in rawText', () => {
    expect(normalizeHNItem(item).rawText).toContain('Show HN: Open-source LLM fine-tuning');
  });
});
