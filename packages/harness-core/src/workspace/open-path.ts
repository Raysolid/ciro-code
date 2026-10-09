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

/** 用系统默认应用打开工作区内文件 */
export async function openPathExternally(workspace: string, relPath: string): Promise<void> {
  const abs = assertReadable(workspace, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SandboxError(`File not found: ${relPath}`);
  }

  if (process.platform === 'win32') {
    const winPath = toWinPath(abs);
    const q = winPath.replace(/'/g, "''");
    // ShellExecute 打开文件，避免 cmd start 对中文路径的编码问题
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
