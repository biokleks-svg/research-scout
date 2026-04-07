import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/gemini', () => ({ getFlashModel: vi.fn() }));
vi.mock('@/lib/r2', () => ({ uploadFile: vi.fn() }));
vi.mock('@/server/db', () => ({
  db: {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn() })) })) })),
  },
}));
vi.mock('@/server/db/schema', () => ({ contentItems: {}, processingRegistry: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})) }));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })) }));
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    png:    vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  })),
}));

import { buildVisualSpecPrompt, extractImageFromResponse } from '../infographic';

describe('buildVisualSpecPrompt', () => {
  it('includes title and abstract in the prompt', () => {
    const prompt = buildVisualSpecPrompt('My Paper', 'Abstract about RL.');
    expect(prompt).toContain('My Paper');
    expect(prompt).toContain('Abstract about RL.');
  });

  it('mentions infographic in the prompt', () => {
    const prompt = buildVisualSpecPrompt('T', 'A');
    expect(prompt.toLowerCase()).toContain('infographic');
  });
});

describe('extractImageFromResponse', () => {
  it('returns null when no inline data present', () => {
    const fakeResponse = {
      candidates: [{
        content: { parts: [{ text: 'no image here' }] },
      }],
    };
    expect(extractImageFromResponse(fakeResponse as any)).toBeNull();
  });

  it('returns buffer when inline image data is present', () => {
    const base64 = Buffer.from('fake-png-data').toString('base64');
    const fakeResponse = {
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: base64 } }],
        },
      }],
    };
    const result = extractImageFromResponse(fakeResponse as any);
    expect(result).toBeInstanceOf(Buffer);
  });
});
