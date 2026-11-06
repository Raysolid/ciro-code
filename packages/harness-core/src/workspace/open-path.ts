import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  extensionsDir,
  globalSkillsDir,
  projectRulesDir,
  projectSkillsDir,
} from '../paths/product-paths.js';
import { assertReadable, SandboxError } from '../sandbox/path-sandbox.js';

const execFileAsync = promisify(execFile);

function toWinPath(p: string): string {
  return p.replace(/\//g, '\\');
}

/** PowerShell -EncodedCommand：UTF-16LE，避免中文路径经控制台代码页损坏 */
function psEncoded(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

async function runPowerShell(script: string): Promise<void> {
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', psEncoded(script)],
    { windowsHide: true, timeout: 15_000 },
  );
}

/**
 * 经 ShellExecute（ProcessStartInfo.UseShellExecute）启动 explorer。
 * 直接 spawn explorer + /select 在含空格/中文路径时经常无窗口或落到「文档」。
 */
async function revealWindows(abs: string): Promise<void> {
  const winPath = toWinPath(abs);
  const q = winPath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${q}'
if (-not (Test-Path -LiteralPath $path)) { throw "Path not found: $path" }
$arg = '/select,"' + $path + '"'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'explorer.exe'
$psi.Arguments = $arg
$psi.UseShellExecute = $true
[void][System.Diagnostics.Process]::Start($psi)
`;
  await runPowerShell(script);
}

export type ProductDirKind =
  | 'extensions'
  | 'globalSkills'
  | 'projectSkills'
  | 'projectRules'
  | 'agentsMd';

const PRODUCT_DIR_KINDS: readonly ProductDirKind[] = [
  'extensions',
  'globalSkills',
  'projectSkills',
  'projectRules',
  'agentsMd',
];

export function isProductDirKind(raw: string): raw is ProductDirKind {
  return (PRODUCT_DIR_KINDS as readonly string[]).includes(raw);
}

async function openWindowsFolder(dir: string): Promise<void> {
  const winPath = toWinPath(dir);
  const q = winPath.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$path = '${q}'
if (-not (Test-Path -LiteralPath $path)) { throw "Path not found: $path" }
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'explorer.exe'
$psi.Arguments = $path
$psi.UseShellExecute = $true
[void][System.Diagnostics.Process]::Start($psi)
`;
  await runPowerShell(script);
}

/**
 * 打开方式（对齐 VS Code / 资源管理器）：
 * - default：系统默认关联
 * - pick：系统「打开方式」对话框（Windows）
 * - cursor / vscode：仅当 PATH 中真实可解析到可执行文件时展示
 * 不再硬编码 Notepad 等系统组件。
 */
export type FileOpenHandlerId = 'default' | 'pick' | 'cursor' | 'vscode';

export type FileOpenHandlerInfo = {
  id: FileOpenHandlerId;
  label: string;
  available: boolean;
};

const OPEN_HANDLER_LABELS: Record<FileOpenHandlerId, string> = {
  default: 'System default',
  pick: 'Choose another app…',
  cursor: 'Cursor',
  vscode: 'VS Code',
};

let openHandlersCache: FileOpenHandlerInfo[] | null = null;

/** 经 where/which 解析到真实路径才算可用，避免假阳性 */
async function resolveExecutable(cmd: string): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', [cmd], {
        timeout: 5_000,
        windowsHide: true,
      });
      return stdout
        .trim()
        .split(/\r?\n/)
        .some((line) => {
          const p = line.trim();
          return p.length > 0 && existsSync(p);
        });
    } catch {
      return false;
    }
  }
  try {
    const { stdout } = await execFileAsync('which', [cmd], { timeout: 5_000 });
    const p = stdout.trim().split('\n')[0]?.trim();
    return Boolean(p && existsSync(p));
  } catch {
    return false;
  }
}

function systemPickAvailable(): boolean {
  // Windows「打开方式」对话框；其它平台无稳定等价 CLI
  return process.platform === 'win32';
}

/** 探测本机可用的打开方式（进程内缓存） */
export async function listFileOpenHandlers(): Promise<FileOpenHandlerInfo[]> {
  if (openHandlersCache) return openHandlersCache;
  const [cursor, vscode] = await Promise.all([
    resolveExecutable('cursor'),
    resolveExecutable('code'),
  ]);
  openHandlersCache = [
    { id: 'default', label: OPEN_HANDLER_LABELS.default, available: true },
    { id: 'pick', label: OPEN_HANDLER_LABELS.pick, available: systemPickAvailable() },
    { id: 'cursor', label: OPEN_HANDLER_LABELS.cursor, available: cursor },
    { id: 'vscode', label: OPEN_HANDLER_LABELS.vscode, available: vscode },
  ];
  return openHandlersCache;
}

export function isFileOpenHandlerId(raw: string): raw is FileOpenHandlerId {
  return raw === 'default' || raw === 'pick' || raw === 'cursor' || raw === 'vscode';
}

/** Windows：弹出系统「打开方式」对话框（与资源管理器一致） */
async function openWithSystemPicker(abs: string): Promise<void> {
  const winPath = toWinPath(abs);
  await execFileAsync('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', winPath], {
    timeout: 15_000,
    windowsHide: true,
  });
}

async function openWithHandler(
  abs: string,
  handlerId: FileOpenHandlerId,
): Promise<void> {
  if (handlerId === 'default') {
    if (process.platform === 'win32') {
      const winPath = toWinPath(abs);
      const q = winPath.replace(/'/g, "''");
      const script = `
$ErrorActionPreference = 'Stop'
$path = '${q}'
if (-not (Test-Path -LiteralPath $path)) { throw "Path not found: $path" }
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $path
$psi.UseShellExecute = $true
[void][System.Diagnostics.Process]::Start($psi)
`;
      await runPowerShell(script);
      return;
    }
    if (process.platform === 'darwin') {
      await execFileAsync('open', [abs], { timeout: 15_000 });
      return;
    }
    await execFileAsync('xdg-open', [abs], { timeout: 15_000 });
    return;
  }
  if (handlerId === 'pick') {
    if (process.platform !== 'win32') {
      throw new SandboxError('System app picker is only available on Windows');
    }
    await openWithSystemPicker(abs);
    return;
  }
  if (handlerId === 'cursor') {
    await execFileAsync('cursor', [abs], { timeout: 15_000, windowsHide: true });
    return;
  }
  if (handlerId === 'vscode') {
    await execFileAsync('code', [abs], { timeout: 15_000, windowsHide: true });
    return;
  }
}

/** 用系统默认应用（或白名单 handler）打开工作区内文件 */
export async function openPathExternally(
  workspace: string,
  relPath: string,
  handlerId: FileOpenHandlerId = 'default',
): Promise<void> {
  const abs = assertReadable(workspace, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SandboxError(`File not found: ${relPath}`);
  }
  const handlers = await listFileOpenHandlers();
  const hit = handlers.find((h) => h.id === handlerId);
  if (!hit?.available) {
    throw new SandboxError(`Open handler unavailable: ${handlerId}`);
  }
  await openWithHandler(abs, handlerId);
}

/** 在资源管理器/Finder 中显示并选中文件 */
export async function revealPathInFolder(workspace: string, relPath: string): Promise<void> {
  const abs = assertReadable(workspace, relPath);
  if (!existsSync(abs)) {
    throw new SandboxError(`Path not found: ${relPath}`);
  }

  if (process.platform === 'win32') {
    try {
      await revealWindows(abs);
    } catch {
      // 选中失败时至少打开所在文件夹
      await openWindowsFolder(dirname(abs));
    }
    return;
  }
  if (process.platform === 'darwin') {
    await execFileAsync('open', ['-R', abs], { timeout: 15_000 });
    return;
  }
  await execFileAsync('xdg-open', [dirname(abs)], { timeout: 15_000 });
}

async function openAbsDirectory(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    await openWindowsFolder(dir);
    return;
  }
  if (process.platform === 'darwin') {
    await execFileAsync('open', [dir], { timeout: 15_000 });
    return;
  }
  await execFileAsync('xdg-open', [dir], { timeout: 15_000 });
}

/** 打开产品目录（仅允许固定 kind，禁止任意路径） */
export async function openProductLocation(
  workspace: string,
  kind: ProductDirKind,
): Promise<void> {
  if (kind === 'extensions') {
    await openAbsDirectory(extensionsDir());
    return;
  }
  if (kind === 'globalSkills') {
    await openAbsDirectory(globalSkillsDir());
    return;
  }
  if (kind === 'projectSkills') {
    await openAbsDirectory(projectSkillsDir(workspace));
    return;
  }
  if (kind === 'projectRules') {
    await openAbsDirectory(projectRulesDir(workspace));
    return;
  }
  const agents = join(workspace, 'AGENTS.md');
  if (existsSync(agents)) {
    await revealPathInFolder(workspace, 'AGENTS.md');
    return;
  }
  await openAbsDirectory(workspace);
}
