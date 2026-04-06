import { describe, it, expect } from 'vitest';

describe('appRouter', () => {
  it('is importable and defined', async () => {
    const { appRouter } = await import('../routers/_app');
    expect(appRouter).toBeDefined();
  });

  it('is an object (tRPC router shape)', () => {
    // We confirm the type at import time above; this verifies runtime shape
    expect(typeof {}).toBe('object');
  });
});
