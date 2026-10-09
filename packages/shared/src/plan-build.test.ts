import { describe, expect, it } from 'vitest';
import {
  PLAN_BUILD_USER_MESSAGE,
  isPlanBuildUserMessage,
  planBuildUserMessage,
  planTitleFromBuildMessage,
  resolveChatTurnMode,
} from './plan-build.js';

describe('isPlanBuildUserMessage', () => {
  it('matches the confirm/build inject string', () => {
    expect(isPlanBuildUserMessage(PLAN_BUILD_USER_MESSAGE)).toBe(true);
    expect(isPlanBuildUserMessage(`  ${PLAN_BUILD_USER_MESSAGE}  `)).toBe(true);
    expect(isPlanBuildUserMessage('Implement something else')).toBe(false);
  });

  it('matches titled inject and round-trips the title', () => {
    const msg = planBuildUserMessage('五子棋');
    expect(isPlanBuildUserMessage(msg)).toBe(true);
    expect(planTitleFromBuildMessage(msg)).toBe('五子棋');
    expect(resolveChatTurnMode('plan', 'plan', msg)).toBe('agent');
  });

  it('untitled inject has no parsed title', () => {
    expect(planTitleFromBuildMessage(PLAN_BUILD_USER_MESSAGE)).toBeUndefined();
    expect(planBuildUserMessage('  ')).toBe(PLAN_BUILD_USER_MESSAGE);
  });
});

describe('resolveChatTurnMode', () => {
  it('forces agent for confirm/build inject even if client still sends plan', () => {
    expect(resolveChatTurnMode('agent', 'plan', PLAN_BUILD_USER_MESSAGE)).toBe('agent');
    expect(resolveChatTurnMode('plan', 'plan', PLAN_BUILD_USER_MESSAGE)).toBe('agent');
  });

  it('uses requested mode otherwise', () => {
    expect(resolveChatTurnMode('plan', 'ask', 'hello')).toBe('ask');
    expect(resolveChatTurnMode('agent', undefined, 'hello')).toBe('agent');
  });
});
