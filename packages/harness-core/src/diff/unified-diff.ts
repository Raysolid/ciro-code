/** 按行 LCS 生成 unified diff；仅变更附近带少量上下文 */

const DEFAULT_MAX_DIFF_CHARS = 48_000;
const CONTEXT = 3;
const DP_CELLS_MAX = 1_500_000;

export interface UnifiedDiffResult {
  text: string;
  truncated: boolean;
}

type Op = { kind: 'eq' | 'del' | 'add'; line: string };

function splitLines(s: string): string[] {
  if (s === '') return [];
  // 统一 CRLF/CR，避免 Windows 读盘与模型 \n 正文整文件被当成全量变更
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * 连续变更区内先全部 del 再全部 add（unified 显示惯例），
 * 避免 LCS 回溯 tie-break 导致 + 行排在 - 行之前。
 */
function normalizeChangeOrder(ops: Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === 'eq') {
      out.push(ops[i]!);
      i += 1;
      continue;
    }
    const dels: Op[] = [];
    const adds: Op[] = [];
    while (i < ops.length && ops[i]!.kind !== 'eq') {
      if (ops[i]!.kind === 'del') dels.push(ops[i]!);
      else adds.push(ops[i]!);
      i += 1;
    }
    out.push(...dels, ...adds);
  }
  return out;
}

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((line) => ({ kind: 'add' as const, line }));
  if (m === 0) return a.map((line) => ({ kind: 'del' as const, line }));
  if (n * m > DP_CELLS_MAX) {
    return [
      ...a.map((line) => ({ kind: 'del' as const, line })),
      ...b.map((line) => ({ kind: 'add' as const, line })),
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'eq', line: a[i - 1]! });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      // 平局走 add，反转后更易形成 del→add；最终仍由 normalizeChangeOrder 兜底
      ops.push({ kind: 'del', line: a[i - 1]! });
      i -= 1;
    } else {
      ops.push({ kind: 'add', line: b[j - 1]! });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.push({ kind: 'del', line: a[i - 1]! });
    i -= 1;
  }
  while (j > 0) {
    ops.push({ kind: 'add', line: b[j - 1]! });
    j -= 1;
  }
  ops.reverse();
  return normalizeChangeOrder(ops);
}

/** 每个连续变更簇单独成 hunk，不因上下文窗口把多次改动合并 */
function toHunks(ops: Op[]): string[] {
  const clusters: { start: number; end: number }[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === 'eq') {
      i += 1;
      continue;
    }
    const start = i;
    while (i < ops.length && ops[i]!.kind !== 'eq') i += 1;
    clusters.push({ start, end: i - 1 });
  }
  if (clusters.length === 0) return [];

  const hunks: string[] = [];
  for (const cluster of clusters) {
    const start = Math.max(0, cluster.start - CONTEXT);
    const end = Math.min(ops.length - 1, cluster.end + CONTEXT);

    let oldBefore = 0;
    let newBefore = 0;
    for (let j = 0; j < start; j++) {
      const k = ops[j]!.kind;
      if (k !== 'add') oldBefore += 1;
      if (k !== 'del') newBefore += 1;
    }

    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let j = start; j <= end; j++) {
      const op = ops[j]!;
      if (op.kind === 'eq') {
        body.push(` ${op.line}`);
        oldCount += 1;
        newCount += 1;
      } else if (op.kind === 'del') {
        body.push(`-${op.line}`);
        oldCount += 1;
      } else {
        body.push(`+${op.line}`);
        newCount += 1;
      }
    }

    const oldStart = oldCount === 0 ? oldBefore : oldBefore + 1;
    const newStart = newCount === 0 ? newBefore : newBefore + 1;
    hunks.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body);
  }
  return hunks;
}

/** 生成 unified diff；相同内容返回空字符串 */
export function buildUnifiedDiff(
  path: string,
  before: string,
  after: string,
  maxChars = DEFAULT_MAX_DIFF_CHARS,
): UnifiedDiffResult {
  if (before === after) return { text: '', truncated: false };

  const hunks = toHunks(lcsOps(splitLines(before), splitLines(after)));
  const text = [`--- a/${path}`, `+++ b/${path}`, ...hunks, ''].join('\n');

  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + '\n... (diff truncated)\n',
    truncated: true,
  };
}
