/**
 * 终端显示宽度：CJK / 全角 = 2，ASCII / 半角 = 1。
 * 一切截断/padding 只允许经本模块（设计 §4.6）。
 */

const WIDE_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3040, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];

function isWideCodePoint(cp: number): boolean {
  if (cp < 0x1100) return false;
  for (const [lo, hi] of WIDE_RANGES) {
    if (cp < lo) return false;
    if (cp <= hi) return true;
  }
  return false;
}

/** 单 grapheme / 码点显示宽度（emoji 近似为 2） */
export function codePointWidth(cp: number): number {
  if (cp === 0) return 0;
  // 组合标记 / 零宽
  if (cp >= 0x300 && cp <= 0x36f) return 0;
  if (cp === 0xfe0f || cp === 0x200d) return 0;
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  return isWideCodePoint(cp) ? 2 : 1;
}

/** 字符串终端列宽（按码点累加；截断点应落在码点边界） */
export function stringWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    w += codePointWidth(cp);
  }
  return w;
}

/** 按显示宽度截断；ellipsis 计入宽度 */
export function truncateToWidth(text: string, maxWidth: number, ellipsis = '…'): string {
  if (maxWidth <= 0) return '';
  if (stringWidth(text) <= maxWidth) return text;
  const ellW = stringWidth(ellipsis);
  if (ellW >= maxWidth) return ellipsis.slice(0, 1);
  let w = 0;
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const cw = codePointWidth(cp);
    if (w + cw + ellW > maxWidth) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}

/** 右侧 pad 到目标显示宽度 */
export function padEndWidth(text: string, width: number, fill = ' '): string {
  const cur = stringWidth(text);
  if (cur >= width) return truncateToWidth(text, width, '');
  return text + fill.repeat(width - cur);
}

/**
 * Soft-wrap plain text to display columns (code-point aware).
 * Preserves explicit newlines; empty paragraphs become empty lines.
 */
export function wrapToWidth(text: string, width: number): string[] {
  if (width <= 0) return [];
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para) {
      out.push('');
      continue;
    }
    let rest = para;
    while (rest.length > 0) {
      if (stringWidth(rest) <= width) {
        out.push(rest);
        break;
      }
      let taken = 0;
      let cols = 0;
      for (const ch of rest) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        const cw = codePointWidth(cp);
        if (cols + cw > width) break;
        taken += ch.length;
        cols += cw;
      }
      if (taken === 0) {
        // Single code point wider than width — force one char forward
        const first = [...rest][0]!;
        out.push(first);
        rest = rest.slice(first.length);
        continue;
      }
      out.push(rest.slice(0, taken));
      rest = rest.slice(taken);
    }
  }
  return out;
}

/** 中间省略（路径等）：保留首尾 */
export function truncateMiddleToWidth(text: string, maxWidth: number, ellipsis = '…'): string {
  if (maxWidth <= 0) return '';
  if (stringWidth(text) <= maxWidth) return text;
  const ellW = stringWidth(ellipsis);
  if (ellW >= maxWidth) return truncateToWidth(text, maxWidth, '');
  const budget = maxWidth - ellW;
  const leftBudget = Math.ceil(budget / 2);
  const rightBudget = Math.floor(budget / 2);

  let left = '';
  let lw = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const cw = codePointWidth(cp);
    if (lw + cw > leftBudget) break;
    left += ch;
    lw += cw;
  }

  let right = '';
  let rw = 0;
  const chars = [...text];
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const cw = codePointWidth(cp);
    if (rw + cw > rightBudget) break;
    right = ch + right;
    rw += cw;
  }
  return left + ellipsis + right;
}
