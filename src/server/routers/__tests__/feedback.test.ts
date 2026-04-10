import { describe, it, expect } from 'vitest';
import { FEEDBACK_TYPES } from '../feedback';

describe('FEEDBACK_TYPES', () => {
  it('includes like, dislike, save, dismiss', () => {
    expect(FEEDBACK_TYPES).toContain('like');
    expect(FEEDBACK_TYPES).toContain('dislike');
    expect(FEEDBACK_TYPES).toContain('save');
    expect(FEEDBACK_TYPES).toContain('dismiss');
  });
});
