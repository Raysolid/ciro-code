import type { TerminalCapabilities } from '../terminal/capabilities.js';
import { styledLineToAnsi } from './ansi.js';
import type { StyledLine } from './types.js';

const ESC = '\x1b';

/**
 * 全屏帧缓冲差分写屏：仅写变化行；可选 synchronized output。
 */
export class FrameBuffer {
  private prev: string[] = [];

  constructor(
    private readonly write: (s: string) => void,
    private readonly syncOutput: boolean,
    private readonly colorCaps?: Pick<TerminalCapabilities, 'truecolor'> | null,
  ) {}

  resize(): void {
    this.prev = [];
  }

  paint(lines: StyledLine[], rows: number, cols: number): void {
    const next: string[] = [];
    for (let i = 0; i < rows; i++) {
      const line = lines[i] ?? [{ text: '' }];
      let ansi = styledLineToAnsi(line, this.colorCaps);
      // 清到行尾，避免残影
      ansi += `${ESC}[K`;
      // 硬截断过长 ANSI 文本在测宽侧已处理；此处保底
      if (ansi.length > cols * 24) ansi = ansi.slice(0, cols * 24) + `${ESC}[0m`;
      next.push(ansi);
    }

    const parts: string[] = [];
    // Reinforce no-wrap each frame (ConPTY / some hosts reset DECAWM)
    parts.push(`${ESC}[?7l`);
    if (this.syncOutput) parts.push(`${ESC}[?2026h`);

    let wrote = false;
    for (let i = 0; i < rows; i++) {
      if (this.prev[i] === next[i]) continue;
      // 1-based row
      parts.push(`${ESC}[${i + 1};1H${next[i]}`);
      wrote = true;
    }

    if (this.syncOutput) parts.push(`${ESC}[?2026l`);
    if (wrote || this.prev.length !== rows) {
      this.write(parts.join(''));
    }
    this.prev = next;
  }
}
