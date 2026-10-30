export interface TerminalCapabilities {
  alternateScreen: boolean;
  mouse: boolean;
  synchronizedOutput: boolean;
  truecolor: boolean;
  bracketedPaste: boolean;
  columns: number;
  rows: number;
  /** Windows VT 可用时 Shift+Tab 可用；否则 mode cycle 用 Alt+M */
  vtMode: boolean;
  termProgram: string;
}

function termProgram(): string {
  return (process.env.TERM_PROGRAM ?? process.env.TERM ?? '').toLowerCase();
}

function supportsTruecolor(): boolean {
  const c = (process.env.COLORTERM ?? '').toLowerCase();
  return c === 'truecolor' || c === '24bit';
}

function supportsMouse(program: string): boolean {
  if (process.env.CIRO_TUI_NO_MOUSE === '1') return false;
  // 常见 GUI 终端白名单；未知环境仍尝试启用，失败则用户可关
  if (
    program.includes('vscode') ||
    program.includes('windows terminal') ||
    program.includes('wt') ||
    program.includes('iterm') ||
    program.includes('ghostty') ||
    program.includes('alacritty') ||
    program.includes('kitty') ||
    program.includes('wezterm') ||
    program.includes('xterm') ||
    program.includes('tmux') ||
    program.includes('screen')
  ) {
    return true;
  }
  // Windows Terminal 常不设 TERM_PROGRAM
  if (process.platform === 'win32') return true;
  return Boolean(process.stdout.isTTY);
}

function supportsSyncOutput(program: string): boolean {
  return (
    program.includes('iterm') ||
    program.includes('kitty') ||
    program.includes('ghostty') ||
    program.includes('wezterm') ||
    process.env.CIRO_TUI_SYNC === '1'
  );
}

function nodeSupportsVt(): boolean {
  if (process.platform !== 'win32') return true;
  const m = /^v(\d+)\.(\d+)/.exec(process.version);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 24 || (major === 24 && minor >= 2) || (major === 22 && minor >= 17) || major >= 25;
}

/** 启动时一次性探测；禁止散落在组件内分支 */
export function detectCapabilities(
  stdout: NodeJS.WriteStream = process.stdout,
): TerminalCapabilities {
  const program = termProgram();
  const isTty = Boolean(stdout.isTTY);
  return {
    alternateScreen: isTty && process.env.CIRO_TUI_MINIMAL !== '1',
    mouse: isTty && supportsMouse(program),
    synchronizedOutput: supportsSyncOutput(program),
    truecolor: supportsTruecolor(),
    bracketedPaste: isTty,
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
    vtMode: nodeSupportsVt(),
    termProgram: program,
  };
}
