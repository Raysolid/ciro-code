import { spawn } from 'node:child_process';
import { platform } from 'node:os';

const ESC = '\x1b';

/** OSC 52 剪贴板（多数现代终端支持；失败时走平台命令） */
export function osc52Copy(text: string): string {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  return `${ESC}]52;c;${b64}${ESC}\\`;
}

/**
 * 写入系统剪贴板。优先 OSC 52（由调用方写入 stdout），
 * 并异步尝试平台命令作为兜底。
 */
export async function copyToClipboard(
  text: string,
  writeOsc?: (seq: string) => void,
): Promise<boolean> {
  if (!text) return false;
  try {
    writeOsc?.(osc52Copy(text));
  } catch {
    // ignore
  }
  return platformCopy(text);
}

function platformCopy(text: string): Promise<boolean> {
  const p = platform();
  return new Promise((resolve) => {
    try {
      if (p === 'win32') {
        const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
        // clip 期望 UTF-16LE
        child.stdin.end(Buffer.from(text, 'utf16le'));
        return;
      }
      if (p === 'darwin') {
        const child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
        child.stdin.end(text, 'utf8');
        return;
      }
      const child = spawn('xclip', ['-selection', 'clipboard'], {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      child.on('error', () => {
        const wl = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
        wl.on('error', () => resolve(false));
        wl.on('close', (code) => resolve(code === 0));
        wl.stdin.end(text, 'utf8');
      });
      child.on('close', (code) => resolve(code === 0));
      child.stdin.end(text, 'utf8');
    } catch {
      resolve(false);
    }
  });
}
