import { stringWidth, truncateToWidth } from '../width/measure.js';
import type { ColorSlot, StyledLine, StyledSegment } from '../tui-kit/types.js';

/**
 * 顶边：`╭─ title ──────── right ─╮`
 * title / right 按显示宽度嵌入；过窄时丢 right 再截 title。
 */
export function boxTop(
  width: number,
  opts: { title?: string; right?: string; fg?: ColorSlot; corner?: 'round' | 'square' } = {},
): StyledLine {
  const fg = opts.fg ?? 'border';
  const L = opts.corner === 'square' ? '┌' : '╭';
  const R = opts.corner === 'square' ? '┐' : '╮';
  if (width <= 2) return [{ text: truncateToWidth(L + R, width, ''), fg }];

  const inner = width - 2;
  let title = opts.title ? `─ ${opts.title} ` : '';
  let right = opts.right ? ` ${opts.right} ─` : '';
  if (stringWidth(title) + stringWidth(right) > inner) right = '';
  if (stringWidth(title) > inner) title = truncateToWidth(title, inner, '');
  const fill = Math.max(0, inner - stringWidth(title) - stringWidth(right));
  return [{ text: `${L}${title}${'─'.repeat(fill)}${right}${R}`, fg }];
}

export function boxBottom(
  width: number,
  opts: { fg?: ColorSlot; corner?: 'round' | 'square' } = {},
): StyledLine {
  const fg = opts.fg ?? 'border';
  const L = opts.corner === 'square' ? '└' : '╰';
  const R = opts.corner === 'square' ? '┘' : '╯';
  if (width <= 2) return [{ text: truncateToWidth(L + R, width, ''), fg }];
  return [{ text: `${L}${'─'.repeat(width - 2)}${R}`, fg }];
}

/**
 * Bottom edge with right-side label (Grok-style), always closed:
 * `╰──────── ask · model ──╯`
 * Width: L(1) + fill + sp(1) + label + sp(1) + dash(2) + R(1) === width
 */
export function boxBottomWithRight(
  width: number,
  right: StyledSegment[],
  opts: { fg?: ColorSlot; corner?: 'round' | 'square' } = {},
): StyledLine {
  const fg = opts.fg ?? 'border';
  const L = opts.corner === 'square' ? '└' : '╰';
  const R = opts.corner === 'square' ? '┘' : '╯';
  if (width <= 2) return [{ text: truncateToWidth(L + R, width, ''), fg }];

  const label = right.map((s) => s.text).join('');
  const labelW = stringWidth(label);
  // corners(2) + spaces(2) + trailing ──(2)
  const fill = width - 6 - labelW;
  if (fill < 1) {
    return [{ text: `${L}${'─'.repeat(width - 2)}${R}`, fg }];
  }
  return [
    { text: `${L}${'─'.repeat(fill)} `, fg },
    ...right,
    { text: ` ──${R}`, fg },
  ];
}

/** 内容行：`│ … │`，inner 段合计显示宽应 ≤ width-4（超出由调用方截断） */
export function boxRow(
  width: number,
  inner: StyledSegment[],
  opts: { fg?: ColorSlot } = {},
): StyledLine {
  const fg = opts.fg ?? 'border';
  if (width <= 2) return [{ text: truncateToWidth('││', width, ''), fg }];
  const innerW = Math.max(0, width - 4);
  const plain = inner.map((s) => s.text).join('');
  const pad = Math.max(0, innerW - stringWidth(plain));
  return [{ text: '│ ', fg }, ...inner, { text: `${' '.repeat(pad)} │`, fg }];
}
