import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

const METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

/**
 * 全屏差分写屏下，绕过 tui-kit 的 stdout 会撕裂画面。
 * 装配时接管 console.* → ~/.ciro/logs/tui.log（§3.3）。
 */
export function redirectConsoleToFile(logPath?: string): () => void {
  const dir = join(homedir(), '.ciro', 'logs');
  mkdirSync(dir, { recursive: true });
  const file = logPath ?? join(dir, 'tui.log');
  const originals: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

  const write = (level: string, args: unknown[]) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ')}\n`;
    try {
      appendFileSync(file, line, 'utf8');
    } catch {
      // ignore disk errors during stream
    }
  };

  for (const m of METHODS) {
    originals[m] = console[m].bind(console);
    console[m] = (...args: unknown[]) => write(m, args);
  }

  return () => {
    for (const m of METHODS) {
      const orig = originals[m];
      if (orig) console[m] = orig as typeof console.log;
    }
  };
}
