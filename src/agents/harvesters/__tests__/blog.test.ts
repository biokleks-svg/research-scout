import { describe, it, expect } from 'vitest';
import { buildBlogContentHash, normalizeBlogItem, type RawBlogItem } from '../blog';

describe('buildBlogContentHash', () => {
  it('produces stable sha256 hex from feedUrl + title', () => {
    const h1 = buildBlogContentHash('https://openai.com/blog/rss.xml', 'GPT-5 is here');
    const h2 = buildBlogContentHash('https://openai.com/blog/rss.xml', 'GPT-5 is here');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('differs for different titles', () => {
    const h1 = buildBlogContentHash('https://x.com', 'A');
    const h2 = buildBlogContentHash('https://x.com', 'B');
    expect(h1).not.toBe(h2);
  });
});

describe('normalizeBlogItem', () => {
  const item: RawBlogItem = {
    title: ['  Scaling Laws  '],
    link:  ['https://openai.com/blog/scaling'],
    description: ['Short description'],
    pubDate: ['Mon, 01 Jan 2024 00:00:00 GMT'],
    'content:encoded': [],
  };

  it('trims title', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.title).toBe('Scaling Laws');
  });

  it('uses link as sourceUrl and sourceId', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.sourceUrl).toBe('https://openai.com/blog/scaling');
    expect(r.sourceId).toBe('https://openai.com/blog/scaling');
  });

  it('returns sourceType blog', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.sourceType).toBe('blog');
  });

  it('falls back to description when content:encoded is empty', () => {
    const r = normalizeBlogItem(item, 'https://openai.com/blog/rss.xml');
    expect(r.rawText).toBe('Short description');
  });
});
