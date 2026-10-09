import { describe, expect, it } from 'vitest';
import { isProductDirKind } from './open-path.js';

describe('isProductDirKind', () => {
  it('accepts only product dir kinds', () => {
    expect(isProductDirKind('extensions')).toBe(true);
    expect(isProductDirKind('globalSkills')).toBe(true);
    expect(isProductDirKind('../../etc')).toBe(false);
    expect(isProductDirKind('')).toBe(false);
  });
});
