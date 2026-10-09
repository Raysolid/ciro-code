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
  return s.split('\n');
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
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
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
  return ops;
}

function toHunks(ops: Op[]): string[] {
  const changeAt: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.kind !== 'eq') changeAt.push(i);
  }
  if (changeAt.length === 0) return [];

  const hunks: string[] = [];
  let p = 0;
  while (p < changeAt.length) {
    let start = Math.max(0, changeAt[p]! - CONTEXT);
    let end = Math.min(ops.length - 1, changeAt[p]! + CONTEXT);
    let q = p + 1;
    while (q < changeAt.length && changeAt[q]! <= end + CONTEXT) {
      end = Math.min(ops.length - 1, changeAt[q]! + CONTEXT);
      q += 1;
    }

    let oldBefore = 0;
    let newBefore = 0;
    for (let i = 0; i < start; i++) {
      const k = ops[i]!.kind;
      if (k !== 'add') oldBefore += 1;
      if (k !== 'del') newBefore += 1;
    }

    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let i = start; i <= end; i++) {
      const op = ops[i]!;
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
    p = q;
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
