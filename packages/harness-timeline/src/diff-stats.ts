import { TOOL_LABEL_KEYS as K } from './labels.js';
import type { TranslateFn } from './translate.js';

/** 从 unified diff 统计 +N -M */
export function countDiffStats(unifiedDiff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

export function formatWorkedFor(workedMs: number, t: TranslateFn): string {
  const totalSec = Math.max(1, Math.round(workedMs / 1000));
  if (totalSec < 60) return t(K.workedSeconds, { n: totalSec });
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (s === 0) return t(K.workedMinutes, { n: m });
  return t(K.workedMinutesSeconds, { m, s });
}
