import { describe, it, expect } from 'vitest';
import { lucia } from '../auth';

describe('lucia instance', () => {
  it('is defined and has validateSession method', () => {
    expect(lucia).toBeDefined();
    expect(typeof lucia.validateSession).toBe('function');
  });

  it('creates a blank session cookie named auth_session', () => {
    const blank = lucia.createBlankSessionCookie();
    expect(blank.name).toBe('auth_session');
  });
});
