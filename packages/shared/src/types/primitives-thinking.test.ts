import { describe, expect, it } from 'vitest';
import { DEFAULT_THINKING_LEVEL, toMenuThinkingLevel } from './primitives.js';

describe('toMenuThinkingLevel', () => {
  it('passes menu levels through', () => {
    expect(toMenuThinkingLevel('low')).toBe('low');
    expect(toMenuThinkingLevel('medium')).toBe('medium');
    expect(toMenuThinkingLevel('high')).toBe('high');
    expect(toMenuThinkingLevel('max')).toBe('max');
  });

  it('maps Pi-only levels to menu four', () => {
    expect(toMenuThinkingLevel('minimal')).toBe('low');
    expect(toMenuThinkingLevel('xhigh')).toBe('high');
  });

  it('defaults off/undefined to medium', () => {
    expect(toMenuThinkingLevel('off')).toBe(DEFAULT_THINKING_LEVEL);
    expect(toMenuThinkingLevel(undefined)).toBe(DEFAULT_THINKING_LEVEL);
  });
});
