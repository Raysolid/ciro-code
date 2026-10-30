import { stringWidth } from './width/measure.js';
import type { StyledLine, StyledSegment } from './tui-kit/types.js';
import { styledLineToPlain } from './tui-kit/ansi.js';

export interface ScreenPos {
  row: number; // 0-based
  col: number; // 0-based display column
}

export interface TextSelection {
  anchor: ScreenPos;
  focus: ScreenPos;
}

/** 规范化选区为自上而下、自左而右 */
export function normalizeSelection(sel: TextSelection): { a: ScreenPos; b: ScreenPos } {
  const { anchor: a0, focus: b0 } = sel;
  if (a0.row < b0.row || (a0.row === b0.row && a0.col <= b0.col)) {
    return { a: a0, b: b0 };
  }
  return { a: b0, b: a0 };
}

export function selectionIsEmpty(sel: TextSelection | null | undefined): boolean {
  if (!sel) return true;
  return sel.anchor.row === sel.focus.row && sel.anchor.col === sel.focus.col;
}

/** 按显示列截取（CJK 安全） */
export function sliceByCols(text: string, fromCol: number, toCol: number): string {
  if (toCol <= fromCol) return '';
  let col = 0;
  let out = '';
  for (const ch of text) {
    const cw = stringWidth(ch);
    if (cw === 0) {
      if (col >= fromCol && col < toCol) out += ch;
      continue;
    }
    if (col + cw > toCol) break;
    if (col >= fromCol) out += ch;
    col += cw;
  }
  return out;
}

/** 从纯文本行提取选区内容 */
export function extractSelectionText(plainLines: string[], sel: TextSelection): string {
  const { a, b } = normalizeSelection(sel);
  if (a.row < 0 || b.row < 0) return '';
  if (a.row === b.row) {
    return sliceByCols(plainLines[a.row] ?? '', a.col, b.col);
  }
  const parts: string[] = [];
  for (let r = a.row; r <= b.row; r++) {
    const line = plainLines[r] ?? '';
    if (r === a.row) parts.push(sliceByCols(line, a.col, stringWidth(line)));
    else if (r === b.row) parts.push(sliceByCols(line, 0, b.col));
    else parts.push(line);
  }
  return parts.join('\n');
}

type CellStyle = Omit<StyledSegment, 'text'>;

function expandCells(line: StyledLine): Array<{ ch: string; style: CellStyle; w: number }> {
  const cells: Array<{ ch: string; style: CellStyle; w: number }> = [];
  for (const seg of line) {
    const style: CellStyle = {
      fg: seg.fg,
      bg: seg.bg,
      bold: seg.bold,
      dim: seg.dim,
      underline: seg.underline,
      inverse: seg.inverse,
    };
    for (const ch of seg.text) {
      cells.push({ ch, style, w: stringWidth(ch) });
    }
  }
  return cells;
}

function collapseCells(
  cells: Array<{ ch: string; style: CellStyle }>,
): StyledLine {
  const out: StyledSegment[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    const same =
      last &&
      last.fg === c.style.fg &&
      last.bg === c.style.bg &&
      last.bold === c.style.bold &&
      last.dim === c.style.dim &&
      last.underline === c.style.underline &&
      last.inverse === c.style.inverse;
    if (same) last!.text += c.ch;
    else out.push({ text: c.ch, ...c.style });
  }
  return out;
}

/** 在 StyledLine 上对 [fromCol, toCol) 施加 inverse */
export function highlightLineCols(line: StyledLine, fromCol: number, toCol: number): StyledLine {
  if (toCol <= fromCol) return line;
  const cells = expandCells(line);
  let col = 0;
  const next = cells.map((c) => {
    const selected = c.w > 0 && col < toCol && col + c.w > fromCol;
    const styled = selected ? { ...c.style, inverse: true } : c.style;
    col += c.w;
    return { ch: c.ch, style: styled };
  });
  return collapseCells(next);
}

/** 对整帧施加选区高亮 */
export function applySelectionHighlight(
  lines: StyledLine[],
  sel: TextSelection | null,
): StyledLine[] {
  if (!sel || selectionIsEmpty(sel)) return lines;
  const { a, b } = normalizeSelection(sel);
  return lines.map((line, r) => {
    if (r < a.row || r > b.row) return line;
    const w = stringWidth(styledLineToPlain(line));
    if (a.row === b.row) return highlightLineCols(line, a.col, b.col);
    if (r === a.row) return highlightLineCols(line, a.col, w);
    if (r === b.row) return highlightLineCols(line, 0, b.col);
    return highlightLineCols(line, 0, w);
  });
}
