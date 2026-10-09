/** UI「继续」注入的用户消息 */
export const DEBUG_PROCEED_USER_MESSAGE = 'Issue reproduced, please proceed.';

/** UI「标记已修复」注入的用户消息 */
export const DEBUG_MARK_FIXED_USER_MESSAGE =
  'The issue has been fixed. Please clean up the instrumentation.';

export interface DebugHitlUnlock {
  analyzeUnlocked: boolean;
  cleanupUnlocked: boolean;
}

/**
 * 根据用户本轮文本决定是否解锁读 log / 拆探针。
 * 按钮与手打确认等价；未点闸门但明确要求清理时也允许拆探针。
 */
export function debugHitlUnlockFromUserText(text: string): DebugHitlUnlock {
  const t = text.trim();
  if (!t) return { analyzeUnlocked: false, cleanupUnlocked: false };
  if (
    t === DEBUG_MARK_FIXED_USER_MESSAGE ||
    /clean up(?: the)? instrumentation/i.test(t)
  ) {
    return { analyzeUnlocked: true, cleanupUnlocked: true };
  }
  if (t === DEBUG_PROCEED_USER_MESSAGE) {
    return { analyzeUnlocked: true, cleanupUnlocked: false };
  }
  return { analyzeUnlocked: false, cleanupUnlocked: false };
}
