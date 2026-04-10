import { describe, it, expect } from 'vitest';
import { buildVideoContentHash, normalizeYouTubeVideo } from '../video';
import type { RawYouTubeVideo } from '../video';

describe('buildVideoContentHash', () => {
  it('returns stable 64-char hex', () => {
    const h = buildVideoContentHash('dQw4w9WgXcQ');
    expect(h).toHaveLength(64);
    expect(buildVideoContentHash('dQw4w9WgXcQ')).toBe(h);
  });
});

describe('normalizeYouTubeVideo', () => {
  const video: RawYouTubeVideo = {
    id:      { videoId: 'dQw4w9WgXcQ' },
    snippet: {
      title:       'Attention Is All You Need — Explained',
      description: 'Deep dive into the transformer architecture.',
      channelId:   'UCbmNph6atAoGfqLoCL_duAg',
      channelTitle: 'Yannic Kilcher',
      publishedAt: '2024-03-01T10:00:00Z',
    },
  };

  it('sets sourceType to video', () => {
    expect(normalizeYouTubeVideo(video).sourceType).toBe('video');
  });

  it('uses videoId as sourceId', () => {
    expect(normalizeYouTubeVideo(video).sourceId).toBe('dQw4w9WgXcQ');
  });

  it('sets YouTube watch URL', () => {
    expect(normalizeYouTubeVideo(video).sourceUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('includes description in rawText', () => {
    expect(normalizeYouTubeVideo(video).rawText).toContain('transformer architecture');
  });
});
