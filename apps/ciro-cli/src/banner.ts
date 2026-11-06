import { exec } from 'node:child_process';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const SHADE = '\x1b[38;5;24m';

/** ANSI Shadow wordmark (solid face + bevel). */
const WORDMARK = [
  ' ██████╗██╗██████╗  ██████╗',
  '██╔════╝██║██╔══██╗██╔═══██╗',
  '██║     ██║██████╔╝██║   ██║',
  '██║     ██║██╔══██╗██║   ██║',
  '╚██████╗██║██║  ██║╚██████╔╝',
  ' ╚═════╝╚═╝╚═╝  ╚═╝ ╚═════╝',
];

const FACE_GRADIENT = [
  '\x1b[38;5;159m',
  '\x1b[38;5;87m',
  '\x1b[38;5;51m',
  '\x1b[38;5;45m',
  '\x1b[38;5;39m',
  '\x1b[38;5;33m',
];

function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR == null;
}

function paint(text: string, ...codes: string[]): string {
  if (!colorEnabled()) return text;
  return `${codes.join('')}${text}${RESET}`;
}

function paintSolidRow(row: string, face: string): string {
  if (!colorEnabled()) return row;
  let out = '';
  for (const ch of row) {
    if (ch === '█') out += `${BOLD}${face}${ch}${RESET}`;
    else if (ch === ' ') out += ch;
    else out += `${SHADE}${ch}${RESET}`;
  }
  return out;
}

/** Print brand splash (stdout). No ANSI when not a TTY / NO_COLOR. */
export function printCiroBanner(version: string): void {
  const lines = WORDMARK.map((row, i) => paintSolidRow(row, FACE_GRADIENT[i]!));
  lines.unshift('\n');
  lines.push('');
  lines.push(`  ${paint('Ciro Code', BOLD)}  ${paint(`v${version}`, DIM)}`);
  lines.push('');
  console.log(lines.join('\n'));
}

export function printWebReady(info: {
  url: string;
  workspace: string;
  agentBackend: string;
  mode: string;
  profile?: string;
  willOpen: boolean;
}): void {
  const rows: Array<[string, string]> = [
    ['Workbench', info.url],
    ['Health', `${info.url}/health`],
    ['Workspace', info.workspace],
    ['Backend', info.agentBackend],
    ['Mode', info.mode],
  ];
  if (info.profile) rows.push(['Profile', info.profile]);

  console.log(`  ${paint('Local server ready', BOLD)}`);
  for (const [label, value] of rows) {
    console.log(`  ${paint(label.padEnd(10), DIM)} ${value}`);
  }
  console.log(
    `  ${paint('Browser'.padEnd(10), DIM)} ${info.willOpen ? 'opening…' : 'skipped (--no-open)'}`,
  );
  console.log('');
}

/** Cross-platform browser open (Windows `start` needs an empty title arg). */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.warn(`  Could not open browser: ${err.message}`);
    }
  });
}
