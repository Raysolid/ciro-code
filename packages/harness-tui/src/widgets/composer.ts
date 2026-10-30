import type { HarnessMode } from '@ciro-code/harness-shared';
import {
  countPasteLines,
  pasteChipLabel,
  splitInputPieces,
} from '../paste-blocks.js';
import { modeToSlot } from '../theme/resolve.js';
import { stringWidth, truncateToWidth, wrapToWidth } from '../width/measure.js';
import type { ColorSlot, StyledLine, StyledSegment } from '../tui-kit/types.js';
import { boxBottomWithRight, boxRow, boxTop } from './box.js';
import { formatModeLabel } from './render-messages.js';

export interface ComposerInput {
  width: number;
  input: string;
  mode: HarnessMode;
  modelLabel: string;
  focusScrollback: boolean;
  autocomplete: 'slash' | 'mention' | null;
  /** id → 原文（用于 chip 行数） */
  pasteBlocks?: ReadonlyMap<number, string>;
  /** 正文最大可视行数（含软换行） */
  maxBodyRows?: number;
}

export interface ComposerResult {
  lines: StyledLine[];
  /** 相对 composer 顶边，光标所在行偏移（供 hit） */
  inputRowOffset: number;
  bodyRowCount: number;
}

export const COMPOSER_PROMPT = '❯ ';

function contPad(promptW: number): string {
  return ' '.repeat(Math.max(1, promptW));
}

type VisSeg =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; label: string };

/** 将 input 展开为可视段（文本 / 粘贴 chip） */
export function toVisualSegs(
  input: string,
  pasteBlocks: ReadonlyMap<number, string> | undefined,
): VisSeg[] {
  const out: VisSeg[] = [];
  for (const p of splitInputPieces(input)) {
    if (p.kind === 'text') {
      if (p.text) out.push({ kind: 'text', text: p.text });
    } else {
      const n = Math.max(1, countPasteLines(pasteBlocks?.get(p.id) ?? '') || 1);
      out.push({ kind: 'chip', label: pasteChipLabel(n) });
    }
  }
  if (!out.length) out.push({ kind: 'text', text: '' });
  return out;
}

/**
 * 按列宽折行：chip 不可拆；文本可软折 / 保留 \\n。
 * 所有行共用同一 contentBudget（= innerW - promptW），前缀宽恒等于 promptW，避免边框溢出。
 */
export function layoutComposerRows(
  segs: VisSeg[],
  contentBudget: number,
  opts: { showCursor: boolean },
): VisSeg[][] {
  const budget = Math.max(1, contentBudget);
  const rows: VisSeg[][] = [];
  let cur: VisSeg[] = [];
  let used = 0;

  const flush = () => {
    rows.push(cur);
    cur = [];
    used = 0;
  };

  const pushChip = (label: string) => {
    const w = stringWidth(label);
    if (used > 0 && used + w > budget) flush();
    // chip 过宽则截断标签
    const shown = w > budget ? truncateToWidth(label, budget) : label;
    cur.push({ kind: 'chip', label: shown });
    used += stringWidth(shown);
    if (used >= budget) flush();
  };

  const pushText = (text: string) => {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) flush();
      let rest = parts[i]!;
      while (rest.length > 0) {
        const room = Math.max(1, budget - used);
        if (stringWidth(rest) <= room) {
          cur.push({ kind: 'text', text: rest });
          used += stringWidth(rest);
          rest = '';
          break;
        }
        const chunk = wrapToWidth(rest, room)[0] ?? '';
        if (!chunk) {
          // 单字宽过 room：强制推一行
          flush();
          continue;
        }
        cur.push({ kind: 'text', text: chunk });
        used += stringWidth(chunk);
        rest = rest.slice(chunk.length);
        if (rest.length > 0 || used >= budget) flush();
      }
    }
  };

  for (const s of segs) {
    if (s.kind === 'chip') pushChip(s.label);
    else pushText(s.text);
  }

  if (opts.showCursor) {
    const cw = 1;
    if (used + cw > budget && used > 0) flush();
    cur.push({ kind: 'text', text: '█' });
    used += cw;
  }

  if (cur.length > 0 || rows.length === 0) flush();
  return rows;
}

function rowToSegments(
  row: VisSeg[],
  opts: { textFg: ColorSlot; chipFg: ColorSlot; chipBg: ColorSlot },
): StyledSegment[] {
  const segs: StyledSegment[] = [];
  for (const s of row) {
    if (s.kind === 'chip') {
      segs.push({ text: s.label, fg: opts.chipFg, bg: opts.chipBg, bold: true });
    } else if (s.text) {
      segs.push({ text: s.text, fg: opts.textFg });
    }
  }
  return segs;
}

/**
 * 多行 Composer：
 * - 前缀宽恒定，续行空格对齐，避免 ❯ 全角导致边框错乱
 * - 多行粘贴以 `[Pasted N lines]` chip 展示
 */
export function buildComposerBox(input: ComposerInput): ComposerResult {
  const focusScrollback = input.focusScrollback;
  const modeSlot = modeToSlot(input.mode);
  const borderFg: ColorSlot = 'textMuted';
  const top = boxTop(input.width, { fg: borderFg, corner: 'round' });

  const modeLabel = formatModeLabel(input.mode);
  const edgeRight: StyledSegment[] =
    input.width >= 40
      ? [
          { text: modeLabel, fg: modeSlot, bold: true },
          { text: ' · ', fg: 'textMuted', dim: true },
          { text: truncateToWidth(input.modelLabel, 20), fg: 'textMuted' },
        ]
      : [{ text: modeLabel, fg: modeSlot, bold: true }];
  const bottom = boxBottomWithRight(input.width, edgeRight, { fg: borderFg, corner: 'round' });

  const innerW = Math.max(1, input.width - 4);
  const promptW = stringWidth(COMPOSER_PROMPT);
  const pad = contPad(promptW);
  const contentBudget = Math.max(1, innerW - promptW);
  const maxBody = Math.max(1, input.maxBodyRows ?? 8);

  const vis = toVisualSegs(input.input, input.pasteBlocks);
  const allRows = layoutComposerRows(vis, contentBudget, { showCursor: !focusScrollback });
  const visibleRows = allRows.length > maxBody ? allRows.slice(-maxBody) : allRows;
  const showingFrom = Math.max(0, allRows.length - visibleRows.length);

  const promptFg: ColorSlot = focusScrollback ? 'textMuted' : modeSlot;
  const textFg: ColorSlot = focusScrollback ? 'textMuted' : 'text';

  const bodyLines: StyledLine[] = visibleRows.map((row, i) => {
    const usePrompt = showingFrom + i === 0;
    const prefix = usePrompt ? COMPOSER_PROMPT : pad;
    const prefixSeg: StyledSegment = {
      text: prefix,
      fg: usePrompt ? promptFg : textFg,
      bold: usePrompt && !focusScrollback,
    };
    const bodySegs = rowToSegments(row, {
      textFg,
      chipFg: 'codeBg',
      chipBg: 'warning',
    });
    const maxBodyW = Math.max(1, innerW - stringWidth(prefix));
    const bodyW = bodySegs.reduce((a, s) => a + stringWidth(s.text), 0);
    let safeBody = bodySegs;
    if (bodyW > maxBodyW) {
      safeBody = [];
      let used = 0;
      for (const s of bodySegs) {
        if (used >= maxBodyW) break;
        const t = truncateToWidth(s.text, maxBodyW - used, '');
        if (!t) break;
        safeBody.push({ ...s, text: t });
        used += stringWidth(t);
      }
    }
    return boxRow(input.width, [prefixSeg, ...safeBody], { fg: borderFg });
  });

  const lines: StyledLine[] = [top, ...bodyLines, bottom];
  if (input.autocomplete === 'slash') {
    lines.push(
      boxRow(input.width, [{ text: truncateToWidth('/mode  /help  /clear', innerW), fg: 'accent' }], {
        fg: 'border',
      }),
    );
  } else if (input.autocomplete === 'mention') {
    lines.push(
      boxRow(input.width, [{ text: truncateToWidth('@file… (skeleton)', innerW), fg: 'accent' }], {
        fg: 'border',
      }),
    );
  }

  return {
    lines,
    inputRowOffset: 1 + Math.max(0, bodyLines.length - 1),
    bodyRowCount: bodyLines.length,
  };
}
