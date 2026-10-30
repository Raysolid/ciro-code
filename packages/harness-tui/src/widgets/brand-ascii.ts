import { stringWidth } from '../width/measure.js';
import type { StyledLine, StyledSegment } from '../tui-kit/types.js';

/**
 * Brandmark C: thick open C, vertical eyes in the hollow, accent sparkle in the gap
 * (aligned with assets/logo-transparent.png / CiroBrandMark).
 * Fixed 10 columns.
 */
const BRANDMARK_C = [
  ' ██████╗',
  '██╔════╝',
  '██║ ▌▌✦ ',
  '██║     ',
  '╚██████╗',
  ' ╚═════╝',
] as const;

/** Remaining "IRO" from ANSI Shadow wordmark; pad to 20 cols */
const IRO_WORDMARK = [
  '██╗██████╗  ██████╗ ',
  '██║██╔══██╗██╔═══██╗',
  '██║██████╔╝██║   ██║',
  '██║██╔══██╗██║   ██║',
  '██║██║  ██║╚██████╔╝',
  '╚═╝╚═╝  ╚═╝ ╚═════╝ ',
] as const;

const CIRO_COMPACT = [
  '╔═╗✦ ╦╦═╗╔═╗',
  '║▌▌║ ╠╦╝║ ║',
  '╚═╝  ╩╩╚═╚═╝',
] as const;

type CellKind = 'solid' | 'muted' | 'space' | 'star';

function cellKind(ch: string): CellKind {
  if (ch === '█') return 'solid';
  if (ch === ' ') return 'space';
  if (ch === '✦') return 'star';
  // Eyes (▌) and shadow/outline box-drawing share muted gray
  return 'muted';
}

function styleChar(ch: string): StyledSegment {
  switch (cellKind(ch)) {
    case 'solid':
      return { text: ch, fg: 'toolRun' };
    case 'muted':
      return { text: ch, fg: 'textMuted' };
    case 'star':
      return { text: ch, fg: 'accent', bold: true };
    default:
      return { text: ch };
  }
}

function styleRow(row: string): StyledLine {
  const segs: StyledSegment[] = [];
  let buf = '';
  let kind: CellKind | null = null;

  const flush = () => {
    if (!buf || kind == null) return;
    const sample = styleChar(buf[0]!);
    segs.push({ text: buf, fg: sample.fg, bold: sample.bold, dim: sample.dim });
    buf = '';
  };

  for (const ch of row) {
    const next = cellKind(ch);
    if (next !== kind) {
      flush();
      kind = next;
    }
    buf += ch;
  }
  flush();
  return segs;
}

const FULL_MARK_COLS = stringWidth(BRANDMARK_C[0]! + IRO_WORDMARK[0]!);

export function wordmarkPlainWidth(width: number): number {
  if (width < 22) return 5;
  if (width < FULL_MARK_COLS) return stringWidth(CIRO_COMPACT[0]!);
  return FULL_MARK_COLS;
}

/** Render CIRO with brandmark C; picks compact form when width is tight. */
export function renderCiroWordmark(width: number): StyledLine[] {
  if (width < 22) {
    return [
      [
        { text: 'C', fg: 'toolRun' },
        { text: '✦', fg: 'accent', bold: true },
        { text: 'IRO', fg: 'toolRun' },
      ],
    ];
  }
  if (width < FULL_MARK_COLS) {
    return CIRO_COMPACT.map((row) => styleRow(row));
  }
  return BRANDMARK_C.map((cRow, i) => [...styleRow(cRow), ...styleRow(IRO_WORDMARK[i]!)]);
}
