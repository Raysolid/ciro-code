/**
 * 会话有效上下文上限（唯一规则）。
 *
 * 优先级：
 * 1. maxMode 且 apiMaxContext 有效 → 官方上限
 * 2. 用户显式 contextLimit
 * 3. 按 modelId 系列启发式（claude/composer→200k；deepseek/kimi/qwen/…→256k 等）
 * 4. fallbackLimit（未知系列，默认 128k）
 *
 * 非 Max 时若存在 apiMaxContext，再 `min(工作默认, apiMaxContext)`，避免虚高。
 */

/** 对齐 DeepSeek Harness pi-ai / Kimi / Qwen 官方 256k 整数 */
export const FAMILY_CONTEXT_LIMIT_256K = 262_144;
/** 对齐 Cursor / Claude Code 默认工作窗 */
export const FAMILY_CONTEXT_LIMIT_200K = 200_000;

/**
 * 按 modelId 系列推断工作默认上下文（不列具体型号）。
 * 未识别返回 undefined，由调用方用 fallbackLimit（通常 128k）。
 */
export function inferFamilyContextLimit(modelId: string | undefined | null): number | undefined {
  if (modelId == null || modelId.trim() === '') return undefined;
  const id = modelId.toLowerCase();

  // 更具体优先
  if (/gpt-5|o3|o4/.test(id)) return FAMILY_CONTEXT_LIMIT_256K;
  if (/gpt-4|\bo1\b|o1-/.test(id)) return 128_000;
  if (/deepseek|kimi|moonshot|qwen|grok|doubao|seed[-_]/.test(id)) {
    return FAMILY_CONTEXT_LIMIT_256K;
  }
  if (/claude|anthropic|composer/.test(id)) return FAMILY_CONTEXT_LIMIT_200K;
  if (/glm/.test(id)) return 128_000;

  return undefined;
}

export function resolveEffectiveContextLimit(opts: {
  maxMode?: boolean;
  apiMaxContext?: number;
  contextLimit?: number;
  /** 无显式 contextLimit 时用于系列推断 */
  modelId?: string | null;
  fallbackLimit: number;
}): number {
  if (opts.maxMode && opts.apiMaxContext != null && opts.apiMaxContext > 0) {
    return opts.apiMaxContext;
  }

  const base =
    opts.contextLimit != null && opts.contextLimit > 0
      ? opts.contextLimit
      : (inferFamilyContextLimit(opts.modelId) ?? opts.fallbackLimit);

  if (opts.apiMaxContext != null && opts.apiMaxContext > 0) {
    return Math.min(base, opts.apiMaxContext);
  }
  return base;
}
