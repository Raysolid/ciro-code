import type { CompactionResult, HarnessMode } from '@ciro/harness-shared';
import { roughTokenEstimate } from '../context/token-estimate.js';
import { ToolResultStore, buildPreview } from './tool-result-store.js';

export interface ToolResultRecord {
  toolCallId: string;
  toolName: string;
  content: string;
  /** 是否已外置 */
  externalized?: boolean;
}

export interface MicroCompactInput {
  sessionId: string;
  mode: HarnessMode;
  toolResults: ToolResultRecord[];
  /** 保留最近 N 条完整 inline；更早的外置 */
  keepRecentInline?: number;
  /** 小于该 token 数不外置 */
  minTokensToExternalize?: number;
  store: ToolResultStore;
}

export interface MicroCompactOutput {
  result: CompactionResult;
  /** 压缩后的内存侧记录（预览或指针） */
  toolResults: ToolResultRecord[];
  elapsedMs: number;
}

/**
 * Micro-compact：旧 tool result → 智能预览 → 磁盘指针。
 * 目标单次 < 50ms（纯文件 IO + 字符串切片）。
 */
export function runMicroCompact(input: MicroCompactInput): MicroCompactOutput {
  const started = Date.now();
  const keepRecent = input.keepRecentInline ?? 2;
  const minTokens = input.minTokensToExternalize ?? 80;
  const records = [...input.toolResults];
  let tokensSaved = 0;
  let removed = 0;

  const cutoff = Math.max(0, records.length - keepRecent);
  for (let i = 0; i < cutoff; i++) {
    const rec = records[i]!;
    if (rec.externalized) continue;
    const tokens = roughTokenEstimate(rec.content);
    if (tokens < minTokens) {
      // 仍可降为预览以省一点
      const preview = buildPreview(rec.toolName, rec.content);
      tokensSaved += Math.max(0, tokens - roughTokenEstimate(preview));
      rec.content = preview;
      continue;
    }
    input.store.write(rec.toolCallId, rec.toolName, rec.content, 'pointer');
    const preview = buildPreview(rec.toolName, rec.content);
    tokensSaved += Math.max(0, tokens - roughTokenEstimate(preview));
    rec.content = preview;
    rec.externalized = true;
    removed += 1;
  }

  const result: CompactionResult = {
    metadata: {
      method: 'micro',
      removedMessageCount: removed,
      tokensSaved,
      mode: input.mode,
    },
    narrative: removed
      ? `Micro-compact externalized ${removed} tool result(s); saved ~${tokensSaved} tokens.`
      : 'Micro-compact: nothing to externalize.',
  };

  return {
    result,
    toolResults: records,
    elapsedMs: Date.now() - started,
  };
}
