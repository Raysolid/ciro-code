import type { TerminalCapabilities } from './capabilities.js';

const ESC = '\x1b';

/** Alternate screen + 鼠标 + 括号粘贴；退出必须对称关闭（R15） */
export class TerminalScreen {
  private entered = false;
  private mouseOn = false;
  private pasteOn = false;
  private rawOn = false;

  constructor(
    private readonly caps: TerminalCapabilities,
    private readonly stdin: NodeJS.ReadStream = process.stdin,
    private readonly stdout: NodeJS.WriteStream = process.stdout,
  ) {}

  enter(): void {
    if (this.entered) return;
    if (this.stdin.isTTY) {
      this.stdin.setRawMode(true);
      this.rawOn = true;
      this.stdin.resume();
      this.stdin.setEncoding('utf8');
    }
    if (this.caps.alternateScreen) {
      // ?7l 关自动换行：写满 cols 列时否则会把末字符（╮/╯/│）挤到下一行，边框右侧像「没闭合」
      this.stdout.write(`${ESC}[?1049h${ESC}[?25l${ESC}[?7l${ESC}[2J${ESC}[H`);
    }
    if (this.caps.mouse) {
      // 普通跟踪 + 按钮事件 + 任意移动（hover）+ SGR
      this.stdout.write(`${ESC}[?1000h${ESC}[?1002h${ESC}[?1003h${ESC}[?1006h`);
      this.mouseOn = true;
    }
    if (this.caps.bracketedPaste) {
      this.stdout.write(`${ESC}[?2004h`);
      this.pasteOn = true;
    }
    this.entered = true;
  }

  write(buf: string): void {
    this.stdout.write(buf);
  }

  exit(): void {
    if (!this.entered) return;
    try {
      if (this.pasteOn) this.stdout.write(`${ESC}[?2004l`);
      if (this.mouseOn) {
        this.stdout.write(`${ESC}[?1006l${ESC}[?1003l${ESC}[?1002l${ESC}[?1000l`);
      }
      if (this.caps.alternateScreen) {
        this.stdout.write(`${ESC}[?7h${ESC}[?25h${ESC}[?1049l`);
      }
      if (this.rawOn && this.stdin.isTTY) {
        this.stdin.setRawMode(false);
      }
    } catch {
      // best-effort teardown
    }
    this.entered = false;
    this.mouseOn = false;
    this.pasteOn = false;
    this.rawOn = false;
  }
}
