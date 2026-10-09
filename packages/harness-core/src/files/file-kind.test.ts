import { describe, it, expect } from 'vitest';
import { detectFileKind, mimeForPath, isTextPreviewKind } from './file-kind.js';

describe('file-kind', () => {
  it('detects markdown', () => {
    expect(detectFileKind('docs/readme.md')).toBe('markdown');
    expect(isTextPreviewKind('markdown')).toBe(true);
  });

  it('detects images', () => {
    expect(detectFileKind('a/b.png')).toBe('image');
    expect(detectFileKind('logo.SVG')).toBe('image');
    expect(mimeForPath('x.jpg')).toBe('image/jpeg');
    expect(isTextPreviewKind('image')).toBe(false);
  });

  it('detects text code', () => {
    expect(detectFileKind('src/app.ts')).toBe('text');
    expect(detectFileKind('a.json')).toBe('text');
  });

  it('detects binary fallback', () => {
    expect(detectFileKind('app.exe')).toBe('binary');
    expect(detectFileKind('photo.psd')).toBe('binary');
  });
});
