import { stringWidth, truncateToWidth } from '../width/measure.js';
import type { StyledLine } from './types.js';

/** Truncate a styled line by display width without collapsing segment colors. */
export function truncateStyledLine(line: StyledLine, width: number): StyledLine {
  if (width <= 0) return [{ text: '' }];
  const out: StyledLine = [];
  let used = 0;
  for (const seg of line) {
    if (used >= width) break;
    const segW = stringWidth(seg.text);
    if (used + segW <= width) {
      out.push(seg);
      used += segW;
      continue;
    }
    const clipped = truncateToWidth(seg.text, width - used, '');
    if (clipped) out.push({ ...seg, text: clipped });
    used = width;
    break;
  }
  return out.length ? out : [{ text: '' }];
}
