import { describe, expect, it } from 'vitest';
import { isFileOpenHandlerId, isProductDirKind } from './open-path.js';

describe('isProductDirKind', () => {
  it('accepts only product dir kinds', () => {
    expect(isProductDirKind('extensions')).toBe(true);
    expect(isProductDirKind('globalSkills')).toBe(true);
    expect(isProductDirKind('../../etc')).toBe(false);
    expect(isProductDirKind('')).toBe(false);
  });
});

describe('isFileOpenHandlerId', () => {
  it('accepts default/pick/cursor/vscode only', () => {
    expect(isFileOpenHandlerId('default')).toBe(true);
    expect(isFileOpenHandlerId('pick')).toBe(true);
    expect(isFileOpenHandlerId('cursor')).toBe(true);
    expect(isFileOpenHandlerId('vscode')).toBe(true);
    expect(isFileOpenHandlerId('notepad')).toBe(false);
    expect(isFileOpenHandlerId('')).toBe(false);
  });
});
