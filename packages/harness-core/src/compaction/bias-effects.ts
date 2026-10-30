import type { CompactionBias, CompactionConfig } from '@ciro-code/harness-shared';

export interface CompactionBiasEffects {
  /** 从配置阈值上减去的量（aggressive）；required 不偏移 */
  thresholdDelta: number;
  keepRecentInline: number;
  minTokensToExternalize: number;
}

const DEFAULT_KEEP_RECENT = 2;
const DEFAULT_MIN_TOKENS = 80;

/** ModeProfile.compactionBias → 阈值 overlay + micro 参数（无 YAML 旋钮） */
export function resolveCompactionBiasEffects(bias: CompactionBias): CompactionBiasEffects {
  switch (bias) {
    case 'aggressive':
      return {
        thresholdDelta: 0.05,
        keepRecentInline: DEFAULT_KEEP_RECENT,
        minTokensToExternalize: DEFAULT_MIN_TOKENS,
      };
    case 'retain-tool-results':
      return {
        thresholdDelta: 0,
        keepRecentInline: 6,
        minTokensToExternalize: 200,
      };
    default:
      return {
        thresholdDelta: 0,
        keepRecentInline: DEFAULT_KEEP_RECENT,
        minTokensToExternalize: DEFAULT_MIN_TOKENS,
      };
  }
}

/** 对 background/suggest 应用 delta；required 保持不变 */
export function effectiveCompactionThresholds(
  base: CompactionConfig['thresholds'],
  bias: CompactionBias = 'normal',
): CompactionConfig['thresholds'] {
  const { thresholdDelta } = resolveCompactionBiasEffects(bias);
  if (thresholdDelta <= 0) return base;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    background: round(Math.max(0, base.background - thresholdDelta)),
    suggest: round(Math.max(0, base.suggest - thresholdDelta)),
    required: base.required,
  };
}
