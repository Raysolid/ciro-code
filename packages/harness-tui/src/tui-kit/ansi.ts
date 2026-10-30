import { slotToBgOpen, slotToFgOpen } from '../theme/resolve.js';
import type { TerminalCapabilities } from '../terminal/capabilities.js';
import type { StyledLine, StyledSegment } from './types.js';

const ESC = '\x1b';

export type AnsiCaps = Pick<TerminalCapabilities, 'truecolor'> | null | undefined;

function openSeg(seg: StyledSegment, caps: AnsiCaps): string {
  const codes: number[] = [];
  if (seg.bold) codes.push(1);
  if (seg.dim) codes.push(2);
  if (seg.underline) codes.push(4);
  if (seg.inverse) codes.push(7);
  let out = '';
  if (codes.length) out += `${ESC}[${codes.join(';')}m`;
  if (seg.fg) out += slotToFgOpen(seg.fg, caps);
  if (seg.bg) out += slotToBgOpen(seg.bg, caps);
  return out;
}

export function styledLineToAnsi(line: StyledLine, caps?: AnsiCaps): string {
  let out = '';
  for (const seg of line) {
    const open = openSeg(seg, caps);
    out += open + seg.text;
    if (open) out += `${ESC}[0m`;
  }
  return out;
}

export function linesToAnsi(lines: StyledLine[], caps?: AnsiCaps): string {
  return lines.map((l) => styledLineToAnsi(l, caps)).join('\n');
}

/** 纯文本（测快照用） */
export function styledLineToPlain(line: StyledLine): string {
  return line.map((s) => s.text).join('');
}

export function linesToPlain(lines: StyledLine[]): string {
  return lines.map(styledLineToPlain).join('\n');
}
