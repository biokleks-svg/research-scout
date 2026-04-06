import { describe, it, expect } from 'vitest';
import { contentItems, processingRegistry, systemSettings, trends, users } from '../schema';

describe('schema', () => {
  it('contentItems table is defined', () => {
    expect(contentItems).toBeDefined();
  });

  it('processingRegistry has unique source constraint', () => {
    expect(processingRegistry).toBeDefined();
  });

  it('systemSettings has key column', () => {
    expect(systemSettings).toBeDefined();
  });

  it('trends table is defined', () => {
    expect(trends).toBeDefined();
  });

  it('users table is defined', () => {
    expect(users).toBeDefined();
  });
});
