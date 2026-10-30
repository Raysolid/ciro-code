import {
  countPasteLines,
  makePasteMark,
  pasteChipLabel,
  splitInputPieces,
} from '../paste-blocks.js';
import type { TextSelection } from '../selection.js';
import { normalizeSelection, selectionIsEmpty } from '../selection.js';
import { stringWidth, truncateToWidth, wrapToWidth } from '../width/measure.js';
import { COMPOSER_PROMPT } from './composer.js';

/** 正文区一列对应的输入区间 [start, end) */
export interface ContentCell {
  /** 相对 composer 首行 body 的行号 */
  bodyRow: number;
  /** 相对正文起点的显示列（不含 │ 与 ❯ 前缀） */
  contentCol: number;
  inputStart: number;
  inputEnd: number;
}

export interface ComposerGeom {
  /** 屏幕上行：composer 顶边（╭） */
  boxTopRow: number;
  bodyRowCount: number;
  width: number;
  promptW: number;
}

/**
 * 构建 composer 正文单元格 → 输入下标映射（与 buildComposerBox 折行规则一致）。
 * 不含光标 █；截断到 maxBodyRows 末尾窗口。
 */
export function buildComposerContentMap(
  input: string,
  pasteBlocks: ReadonlyMap<number, string> | undefined,
  width: number,
  maxBodyRows: number,
): ContentCell[] {
  const innerW = Math.max(1, width - 4);
  const promptW = stringWidth(COMPOSER_PROMPT);
  const budget = Math.max(1, innerW - promptW);

  type RowBuf = { cols: number; cells: ContentCell[] };
  const rows: RowBuf[] = [];
  let cur: RowBuf = { cols: 0, cells: [] };

  const flush = () => {
    rows.push(cur);
    cur = { cols: 0, cells: [] };
  };

  const pushMapped = (display: string, inputStart: number, inputEnd: number) => {
    let col = cur.cols;
    for (const ch of display) {
      const cw = stringWidth(ch);
      cur.cells.push({
        bodyRow: rows.length,
        contentCol: col,
        inputStart,
        inputEnd,
      });
      // 宽字符占多列时，后续列仍指向同一输入区间
      for (let k = 1; k < cw; k++) {
        cur.cells.push({
          bodyRow: rows.length,
          contentCol: col + k,
          inputStart,
          inputEnd,
        });
      }
      col += cw;
    }
    cur.cols = col;
  };

  const ensureRoom = (need: number) => {
    if (cur.cols > 0 && cur.cols + need > budget) flush();
  };

  let index = 0;
  const pieces = splitInputPieces(input);
  for (const p of pieces) {
    if (p.kind === 'text') {
      const text = p.text;
      const base = index;
      // 按码点推进 index
      let local = 0;
      const parts = text.split('\n');
      for (let pi = 0; pi < parts.length; pi++) {
        if (pi > 0) {
          // 换行本身占 1 个输入字符
          local += 1;
          flush();
        }
        let rest = parts[pi]!;
        let restOffset = 0;
        while (rest.length > 0) {
          const room = Math.max(1, budget - cur.cols);
          if (stringWidth(rest) <= room) {
            for (const ch of rest) {
              const start = base + local + restOffset;
              const end = start + ch.length;
              pushMapped(ch, start, end);
              restOffset += ch.length;
            }
            rest = '';
            break;
          }
          const chunk = wrapToWidth(rest, room)[0] ?? '';
          if (!chunk) {
            flush();
            continue;
          }
          for (const ch of chunk) {
            const start = base + local + restOffset;
            const end = start + ch.length;
            pushMapped(ch, start, end);
            restOffset += ch.length;
          }
          rest = rest.slice(chunk.length);
          if (rest.length > 0 || cur.cols >= budget) flush();
        }
        local += parts[pi]!.length;
      }
      index = base + text.length;
    } else {
      const mark = makePasteMark(p.id);
      const body = pasteBlocks?.get(p.id) ?? '';
      const n = Math.max(1, countPasteLines(body) || 1);
      let label = pasteChipLabel(n);
      const markStart = index;
      const markEnd = index + mark.length;
      ensureRoom(Math.min(stringWidth(label), budget));
      if (stringWidth(label) > budget) label = truncateToWidth(label, budget);
      // chip 整块映射到 mark
      pushMapped(label, markStart, markEnd);
      if (cur.cols >= budget) flush();
      index = markEnd;
    }
  }

  if (cur.cells.length > 0 || rows.length === 0) flush();

  // 与 UI 一致：只保留末尾 maxBodyRows
  const showingFrom = Math.max(0, rows.length - maxBodyRows);
  const visible = rows.slice(showingFrom);
  const out: ContentCell[] = [];
  visible.forEach((row, i) => {
    for (const c of row.cells) {
      out.push({ ...c, bodyRow: i });
    }
  });
  return out;
}

/** 屏幕选区 → 输入 [start, end)；不在 composer 正文内则 null */
export function inputRangeFromSelection(
  sel: TextSelection | null,
  geom: ComposerGeom,
  cells: ContentCell[],
): { start: number; end: number } | null {
  if (!sel || selectionIsEmpty(sel) || geom.bodyRowCount <= 0) return null;
  const { a, b } = normalizeSelection(sel);
  const bodyStart = geom.boxTopRow + 1;
  const bodyEnd = bodyStart + geom.bodyRowCount; // exclusive
  // 选区需与正文行有交集
  if (b.row < bodyStart || a.row >= bodyEnd) return null;

  const contentOrigin = 2 + geom.promptW; // │␠ + prefix

  const inRange = (cell: ContentCell): boolean => {
    const screenRow = bodyStart + cell.bodyRow;
    const screenCol = contentOrigin + cell.contentCol;
    if (screenRow < a.row || screenRow > b.row) return false;
    if (a.row === b.row) return screenCol >= a.col && screenCol < b.col;
    if (screenRow === a.row) return screenCol >= a.col;
    if (screenRow === b.row) return screenCol < b.col;
    return true;
  };

  let start = Infinity;
  let end = -Infinity;
  for (const c of cells) {
    if (!inRange(c)) continue;
    start = Math.min(start, c.inputStart);
    end = Math.max(end, c.inputEnd);
  }
  if (!Number.isFinite(start) || end <= start) return null;
  return { start, end };
}

/** 删除 / 替换选区 */
export function replaceInputRange(
  input: string,
  start: number,
  end: number,
  insert = '',
): string {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.max(0, Math.max(start, end));
  return input.slice(0, lo) + insert + input.slice(hi);
}
