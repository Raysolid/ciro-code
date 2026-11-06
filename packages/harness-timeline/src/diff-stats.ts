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

export interface DiffHunkSlice {
  /** 含 ---/+++ 头 + 单个 @@ hunk，可直接喂给 DiffView / TUI */
  text: string;
  additions: number;
  deletions: number;
}

/** 按 @@ hunk 拆成独立片段（同文件多次改动各一张卡） */
export function splitUnifiedDiffHunks(unifiedDiff: string, path = ''): DiffHunkSlice[] {
  const raw = unifiedDiff.replace(/\r\n/g, '\n').split('\n');
  const meta: string[] = [];
  const hunkStarts: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!;
    if (line.startsWith('@@')) hunkStarts.push(i);
    else if (
      hunkStarts.length === 0 &&
      (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff '))
    ) {
      meta.push(line);
    }
  }
  if (hunkStarts.length === 0) {
    const stats = countDiffStats(unifiedDiff);
    if (stats.additions + stats.deletions === 0) return [];
    return [{ text: unifiedDiff, ...stats }];
  }

  const fileMeta =
    meta.length > 0 ? meta : path ? [`--- a/${path}`, `+++ b/${path}`] : [];

  const slices: DiffHunkSlice[] = [];
  for (let h = 0; h < hunkStarts.length; h++) {
    const from = hunkStarts[h]!;
    const to = h + 1 < hunkStarts.length ? hunkStarts[h + 1]! : raw.length;
    const body = raw.slice(from, to);
    while (body.length > 0 && body[body.length - 1] === '') body.pop();
    const text = [...fileMeta, ...body, ''].join('\n');
    slices.push({ text, ...countDiffStats(body.join('\n')) });
  }
  return slices;
}

export function formatWorkedFor(workedMs: number, t: TranslateFn): string {
  const totalSec = Math.max(1, Math.round(workedMs / 1000));
  if (totalSec < 60) return t(K.workedSeconds, { n: totalSec });
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (s === 0) return t(K.workedMinutes, { n: m });
  return t(K.workedMinutesSeconds, { m, s });
}
