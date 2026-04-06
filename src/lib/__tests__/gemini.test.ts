import { describe, it, expect, vi } from 'vitest';

describe('gemini client', () => {
  it('throws if GEMINI_API_KEY is not set', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    vi.resetModules();
    const { embedText } = await import('../gemini');

    await expect(embedText('hello')).rejects.toThrow('GEMINI_API_KEY');

    process.env.GEMINI_API_KEY = original;
    vi.resetModules();
  });
});
