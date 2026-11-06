import { describe, expect, it } from 'vitest';
import {
  DEBUG_MARK_FIXED_USER_MESSAGE,
  DEBUG_PROCEED_USER_MESSAGE,
  debugHitlUnlockFromUserText,
} from './debug-hitl.js';

describe('debugHitlUnlockFromUserText', () => {
  it('unlocks analyze on Proceed', () => {
    expect(debugHitlUnlockFromUserText(DEBUG_PROCEED_USER_MESSAGE)).toEqual({
      analyzeUnlocked: true,
      cleanupUnlocked: false,
    });
  });

  it('unlocks cleanup on Mark as fixed', () => {
    expect(debugHitlUnlockFromUserText(DEBUG_MARK_FIXED_USER_MESSAGE)).toEqual({
      analyzeUnlocked: true,
      cleanupUnlocked: true,
    });
  });

  it('unlocks cleanup when the user explicitly asks', () => {
    expect(debugHitlUnlockFromUserText('Please clean up the instrumentation.')).toEqual({
      analyzeUnlocked: true,
      cleanupUnlocked: true,
    });
  });

  it('does not unlock a normal follow-up', () => {
    expect(debugHitlUnlockFromUserText('the payable is still wrong')).toEqual({
      analyzeUnlocked: false,
      cleanupUnlocked: false,
    });
    expect(debugHitlUnlockFromUserText('the issue reproduced twice')).toEqual({
      analyzeUnlocked: false,
      cleanupUnlocked: false,
    });
  });
});
