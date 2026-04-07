import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/db/schema', () => ({ contentItems: {}, processingRegistry: {} }));
vi.mock('@/lib/r2', () => ({ uploadFile: vi.fn() }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })) }));

import { buildPodcastStatus } from '../podcast';

describe('buildPodcastStatus', () => {
  it('returns not_requested when podcastUrl is null and status is not_requested', () => {
    expect(buildPodcastStatus(null, 'not_requested')).toBe('not_requested');
  });

  it('returns available when podcastUrl is set', () => {
    expect(buildPodcastStatus('https://r2.example.com/foo.mp3', 'available')).toBe('available');
  });

  it('returns queued when status is queued', () => {
    expect(buildPodcastStatus(null, 'queued')).toBe('queued');
  });

  it('returns generating when status is generating', () => {
    expect(buildPodcastStatus(null, 'generating')).toBe('generating');
  });

  it('returns not_requested when url is null and status is null', () => {
    expect(buildPodcastStatus(null, null)).toBe('not_requested');
  });
});
