import { describe, expect, it } from 'vitest';
import { readPackageVersion } from './package-version.js';

describe('readPackageVersion', () => {
  it('reads this package version', () => {
    const v = readPackageVersion(import.meta.url, ['../package.json'], '0.0.0');
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('falls back when ids miss', () => {
    expect(
      readPackageVersion(import.meta.url, ['./no-such-package.json'], '9.9.9'),
    ).toBe('9.9.9');
  });
});
