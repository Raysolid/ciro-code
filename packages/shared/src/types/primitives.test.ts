import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { asHarnessMode, HARNESS_VERSION, isHarnessMode } from '../index.js';

describe('isHarnessMode / asHarnessMode', () => {
  it('accepts known modes', () => {
    expect(isHarnessMode('ask')).toBe(true);
    expect(asHarnessMode('plan')).toBe('plan');
    expect(asHarnessMode('nope')).toBeUndefined();
    expect(asHarnessMode('nope', 'agent')).toBe('agent');
  });
});

describe('HARNESS_VERSION', () => {
  it('matches harness-shared package.json', () => {
    const pkg = createRequire(import.meta.url)('../../package.json') as {
      version: string;
    };
    expect(HARNESS_VERSION).toBe(pkg.version);
    expect(HARNESS_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
