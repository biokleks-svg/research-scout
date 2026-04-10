import { describe, it, expect } from 'vitest';
import { parseSettingValue, serializeSettingValue } from '../settings';

describe('parseSettingValue', () => {
  it('returns the value as-is for primitives stored in JSONB', () => {
    expect(parseSettingValue(true)).toBe(true);
    expect(parseSettingValue(42)).toBe(42);
    expect(parseSettingValue('flash')).toBe('flash');
  });
});

describe('serializeSettingValue', () => {
  it('wraps value for JSONB storage (returns as-is, JSONB handles it)', () => {
    expect(serializeSettingValue(true)).toBe(true);
    expect(serializeSettingValue(100)).toBe(100);
  });
});
