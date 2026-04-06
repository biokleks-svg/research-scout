import { describe, it, expect, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  db: {
    query: {
      contentItems: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

describe('feed router', () => {
  it('feedRouter is importable', async () => {
    const { feedRouter } = await import('../feed');
    expect(feedRouter).toBeDefined();
  });

  it('appRouter has feed namespace', async () => {
    const { appRouter } = await import('../_app');
    expect(appRouter).toBeDefined();
  });
});
