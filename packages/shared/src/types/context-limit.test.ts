import { describe, expect, it } from 'vitest';
import {
  FAMILY_CONTEXT_LIMIT_200K,
  FAMILY_CONTEXT_LIMIT_256K,
  inferFamilyContextLimit,
  resolveEffectiveContextLimit,
} from './context-limit.js';

describe('inferFamilyContextLimit', () => {
  it('maps deepseek / kimi / qwen / grok / doubao to 256k', () => {
    expect(inferFamilyContextLimit('deepseek-chat')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('deepseek-flash')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('kimi-k2.6')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('moonshot-v1')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('qwen3-max')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('grok-4')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('doubao-pro')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('seed-1.6')).toBe(FAMILY_CONTEXT_LIMIT_256K);
  });

  it('maps claude / composer to 200k', () => {
    expect(inferFamilyContextLimit('claude-sonnet-4')).toBe(FAMILY_CONTEXT_LIMIT_200K);
    expect(inferFamilyContextLimit('anthropic.claude-3')).toBe(FAMILY_CONTEXT_LIMIT_200K);
    expect(inferFamilyContextLimit('composer-2')).toBe(FAMILY_CONTEXT_LIMIT_200K);
  });

  it('maps gpt-5 family to 256k and gpt-4 / glm to 128k', () => {
    expect(inferFamilyContextLimit('gpt-5')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('o3-mini')).toBe(FAMILY_CONTEXT_LIMIT_256K);
    expect(inferFamilyContextLimit('gpt-4o')).toBe(128_000);
    expect(inferFamilyContextLimit('o1-preview')).toBe(128_000);
    expect(inferFamilyContextLimit('glm-4.5')).toBe(128_000);
  });

  it('returns undefined for unknown ids', () => {
    expect(inferFamilyContextLimit('my-custom-router')).toBeUndefined();
    expect(inferFamilyContextLimit('')).toBeUndefined();
    expect(inferFamilyContextLimit(null)).toBeUndefined();
  });
});

describe('resolveEffectiveContextLimit', () => {
  it('uses apiMaxContext when maxMode on', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: true,
        apiMaxContext: 200_000,
        contextLimit: 64_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(200_000);
  });

  it('uses contextLimit when maxMode off', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: false,
        apiMaxContext: 200_000,
        contextLimit: 64_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(64_000);
  });

  it('falls back to config when no contextLimit and unknown model', () => {
    expect(
      resolveEffectiveContextLimit({
        maxMode: true,
        fallbackLimit: 128_000,
      }),
    ).toBe(128_000);
  });

  it('infers family default when contextLimit unset', () => {
    expect(
      resolveEffectiveContextLimit({
        modelId: 'deepseek-chat',
        fallbackLimit: 128_000,
      }),
    ).toBe(FAMILY_CONTEXT_LIMIT_256K);
  });

  it('caps non-max working default by apiMaxContext', () => {
    expect(
      resolveEffectiveContextLimit({
        modelId: 'deepseek-chat',
        apiMaxContext: 128_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(128_000);
  });

  it('prefers explicit contextLimit over family inference', () => {
    expect(
      resolveEffectiveContextLimit({
        modelId: 'deepseek-chat',
        contextLimit: 64_000,
        fallbackLimit: 128_000,
      }),
    ).toBe(64_000);
  });
});
