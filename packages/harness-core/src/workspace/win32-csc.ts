import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 解析本机 .NET Framework csc（winexe 编译用） */
export function resolveDotnetCsc(): string | null {
  const windir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** `%LOCALAPPDATA%\ciro-code\pick-cache` — picker / hidden-console 共用 */
export function win32NativeCacheDir(): string {
  const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const dir = join(base, 'ciro-code', 'pick-cache');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 将 C# 编译为 /t:winexe 并按源码 hash 缓存。
 * 无 csc 或编译失败时返回 null（调用方自行回退）。
 */
export async function compileWin32Winexe(
  csSource: string,
  exePrefix: string,
): Promise<string | null> {
  const csc = resolveDotnetCsc();
  if (!csc) return null;
  const hash = createHash('sha256').update(csSource).digest('hex').slice(0, 16);
  const exe = join(win32NativeCacheDir(), `${exePrefix}-${hash}.exe`);
  if (existsSync(exe)) return exe;

  const csPath = join(tmpdir(), `ciro-${exePrefix}-${randomBytes(4).toString('hex')}.cs`);
  writeFileSync(csPath, csSource, 'utf8');
  try {
    await execFileAsync(
      csc,
      ['/nologo', '/t:winexe', '/optimize+', `/out:${exe}`, csPath],
      {
        encoding: 'utf-8',
        timeout: 60_000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(csPath);
    } catch {
      /* ignore */
    }
  }
  return existsSync(exe) ? exe : null;
}
