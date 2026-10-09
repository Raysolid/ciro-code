/**
 * 会话有效上下文上限（唯一规则）。
 * maxMode 可任意；仅当 apiMaxContext 有效时才用官方上限，否则忽略 maxMode。
 */
export function resolveEffectiveContextLimit(opts: {
  maxMode?: boolean;
  apiMaxContext?: number;
  contextLimit?: number;
  fallbackLimit: number;
}): number {
  if (opts.maxMode && opts.apiMaxContext != null && opts.apiMaxContext > 0) {
    return opts.apiMaxContext;
  }
  if (opts.contextLimit != null && opts.contextLimit > 0) {
    return opts.contextLimit;
  }
  return opts.fallbackLimit;
}
