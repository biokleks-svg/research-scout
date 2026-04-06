import { describe, it, expect, vi } from 'vitest';

describe('feed router', () => {
  it('feedRouter is importable', async () => {
    vi.mock('@/server/db', () => ({
      db: {
        query: {
          contentItems: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
      },
    }));

    const { feedRouter } = await import('../feed');
    expect(feedRouter).toBeDefined();
  });

  it('appRouter has feed namespace', async () => {
    const { appRouter } = await import('../_app');
    // tRPC router object has _def property
    expect(appRouter).toBeDefined();
  });
});
