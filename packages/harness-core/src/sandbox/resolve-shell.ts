import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, normalize } from 'node:path';

export type ShellKind = 'bash' | 'pwsh' | 'powershell' | 'sh';

export type ResolvedShell = {
  kind: ShellKind;
  path: string;
  versionLabel: string;
  label: string;
};

export type ResolveShellDeps = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  probeVersion?: (path: string, kind: ShellKind) => string | undefined;
  /** 注入全局 config `shell.path`；缺省用模块级 applyShellConfigOverride */
  configShellPath?: string | undefined;
};

export type ValidateShellPathResult =
  | { ok: true; shell: ResolvedShell }
  | { ok: false; reason: string };

let cached: ResolvedShell | null = null;
/** 来自 ~/.ciro/config.yaml `shell.path`（由 applyShellConfigOverride 写入） */
let configShellOverride: string | undefined;

function winPath(path: string): string {
  return normalize(path).replace(/\//g, '\\').toLowerCase();
}

/** System32\bash.exe 是 WSL 启动器，勿当 Git Bash */
export function isWslBashPath(path: string): boolean {
  const n = winPath(path);
  return (
    n.includes('\\system32\\bash.exe') ||
    n.includes('\\sysnative\\bash.exe') ||
    n.endsWith('\\system32\\bash') ||
    n.endsWith('\\sysnative\\bash')
  );
}

/** `%LocalAppData%\Microsoft\WindowsApps\*.exe` 执行别名桩（0 字节，Node existsSync 常假） */
export function isAppExecutionAliasPath(path: string): boolean {
  return winPath(path).includes('\\appdata\\local\\microsoft\\windowsapps\\');
}

export function kindFromShellPath(path: string): ShellKind {
  const base = basename(path).toLowerCase();
  if (base === 'pwsh.exe' || base === 'pwsh') return 'pwsh';
  if (base === 'powershell.exe' || base === 'powershell') return 'powershell';
  if (base === 'bash.exe' || base === 'bash') return 'bash';
  if (base === 'sh.exe' || base === 'sh') return 'sh';
  return 'bash';
}

function defaultProbeVersion(path: string, kind: ShellKind): string | undefined {
  try {
    if (kind === 'pwsh' || kind === 'powershell') {
      const r = spawnSync(
        path,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$PSVersionTable.PSVersion.ToString()',
        ],
        { encoding: 'utf8', timeout: 8000, windowsHide: true },
      );
      const line = (r.stdout || '').trim().split(/\r?\n/).find(Boolean);
      return line || undefined;
    }
    const r = spawnSync(path, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const text = `${r.stdout || ''}${r.stderr || ''}`;
    const m =
      text.match(/version\s+(\d+\.\d+(?:\.\d+)?)/i) || text.match(/(\d+\.\d+\.\d+)/);
    return m?.[1];
  } catch {
    return undefined;
  }
}

function buildLabel(kind: ShellKind, versionLabel: string, path: string): string {
  const ver = versionLabel ? ` ${versionLabel}` : '';
  if (kind === 'bash' && /\\git\\bin\\bash\.exe$/i.test(winPath(path))) {
    return `Git Bash${ver}`.trim();
  }
  if (kind === 'bash') return `Bash${ver}`.trim();
  if (kind === 'pwsh') return `PowerShell${ver}`.trim();
  if (kind === 'powershell') return `Windows PowerShell${ver}`.trim();
  return `sh${ver}`.trim();
}

const KNOWN_SHELL_BASENAMES = new Set([
  'bash',
  'bash.exe',
  'sh',
  'sh.exe',
  'pwsh',
  'pwsh.exe',
  'powershell',
  'powershell.exe',
]);

/**
 * 校验显式 shell 路径（设置保存 / env / config 共用）。
 * 拒 WSL System32 bash 与 WindowsApps 执行别名桩。
 */
export function validateShellPath(
  path: string,
  deps: Pick<ResolveShellDeps, 'exists' | 'probeVersion'> = {},
): ValidateShellPathResult {
  const raw = path.trim();
  if (!raw) return { ok: false, reason: 'Shell path is empty' };
  if (!isAbsolute(raw)) {
    return { ok: false, reason: 'Shell path must be absolute' };
  }
  const exists = deps.exists ?? existsSync;
  const probeVersion = deps.probeVersion ?? defaultProbeVersion;
  if (!exists(raw)) {
    return { ok: false, reason: `Shell path does not exist: ${raw}` };
  }
  if (isWslBashPath(raw)) {
    return {
      ok: false,
      reason:
        'WSL System32/Sysnative bash.exe is not supported; use Git Bash or set a real bash path',
    };
  }
  if (isAppExecutionAliasPath(raw)) {
    return {
      ok: false,
      reason:
        'WindowsApps execution-alias stubs are not supported; use a real pwsh/bash install path',
    };
  }
  const base = basename(raw).toLowerCase();
  if (!KNOWN_SHELL_BASENAMES.has(base)) {
    return {
      ok: false,
      reason: `Unrecognized shell executable (expected bash/sh/pwsh/powershell): ${base}`,
    };
  }
  const kind = kindFromShellPath(raw);
  const ver = probeVersion(raw, kind);
  if ((kind === 'bash' || kind === 'sh' || kind === 'pwsh') && ver == null) {
    return {
      ok: false,
      reason: `Shell at ${raw} failed version probe`,
    };
  }
  const versionLabel = ver ?? '';
  return {
    ok: true,
    shell: {
      kind,
      path: raw,
      versionLabel,
      label: buildLabel(kind, versionLabel, raw),
    },
  };
}

/** 应用全局 config `shell.path`；传 undefined/空串清除。仅路径变化时清缓存。 */
export function applyShellConfigOverride(path: string | undefined): void {
  const next = path?.trim() || undefined;
  if (next === configShellOverride) return;
  configShellOverride = next;
  cached = null;
}

function tryCandidate(
  path: string | undefined,
  kind: ShellKind,
  deps: Required<Pick<ResolveShellDeps, 'exists' | 'probeVersion'>>,
  opts?: { requireVersion?: boolean },
): ResolvedShell | null {
  if (!path || !deps.exists(path)) return null;
  if ((kind === 'bash' || kind === 'sh') && isWslBashPath(path)) return null;
  if (isAppExecutionAliasPath(path)) return null;
  const requireVersion = opts?.requireVersion ?? kind !== 'powershell';
  const ver = deps.probeVersion(path, kind);
  if (requireVersion && ver == null) return null;
  const versionLabel = ver ?? '';
  return {
    kind,
    path,
    versionLabel,
    label: buildLabel(kind, versionLabel, path),
  };
}

/** 可注入依赖的解析（单测用）；生产走 resolveShell。无 where/which。 */
export function resolveShellWithDeps(deps: ResolveShellDeps = {}): ResolvedShell {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? existsSync;
  const probeVersion = deps.probeVersion ?? defaultProbeVersion;
  const d = { exists, probeVersion };
  const configPath =
    deps.configShellPath !== undefined
      ? deps.configShellPath?.trim() || undefined
      : configShellOverride;

  const envRaw = env.CIRO_SHELL_PATH?.trim();
  if (envRaw) {
    const checked = validateShellPath(envRaw, d);
    if (checked.ok) return checked.shell;
  }

  if (configPath) {
    const checked = validateShellPath(configPath, d);
    if (checked.ok) return checked.shell;
  }

  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const systemRoot = env.SystemRoot || env.windir || 'C:\\Windows';

    for (const p of [
      join(programFiles, 'Git', 'bin', 'bash.exe'),
      join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    ]) {
      const hit = tryCandidate(p, 'bash', d);
      if (hit) return hit;
    }

    const pwshFixed = join(programFiles, 'PowerShell', '7', 'pwsh.exe');
    const pwshHit = tryCandidate(pwshFixed, 'pwsh', d);
    if (pwshHit) return pwshHit;

    const ps51 = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const psHit = tryCandidate(ps51, 'powershell', d, { requireVersion: false });
    if (psHit) return psHit;

    return {
      kind: 'powershell',
      path: ps51,
      versionLabel: '',
      label: 'Windows PowerShell',
    };
  }

  // POSIX：仅 $SHELL + 固定路径，无 which
  const shellEnv = env.SHELL?.trim();
  if (shellEnv && exists(shellEnv) && !isWslBashPath(shellEnv)) {
    const base = basename(shellEnv).toLowerCase();
    const mapped: ShellKind = base === 'bash' || base === 'bash.exe' ? 'bash' : 'sh';
    const hit = tryCandidate(shellEnv, mapped, d, { requireVersion: false });
    if (hit) return hit;
  }

  for (const [p, kind] of [
    ['/bin/bash', 'bash'],
    ['/usr/bin/bash', 'bash'],
    ['/bin/sh', 'sh'],
  ] as const) {
    const hit = tryCandidate(p, kind, d, { requireVersion: kind === 'bash' });
    if (hit) return hit;
  }

  return {
    kind: 'sh',
    path: '/bin/sh',
    versionLabel: '',
    label: 'sh',
  };
}

/** 进程内缓存；forceRefresh 可重探测 */
export function resolveShell(opts?: { forceRefresh?: boolean }): ResolvedShell {
  if (!opts?.forceRefresh && cached) return cached;
  cached = resolveShellWithDeps();
  return cached;
}

/** 测试或配置变更后清缓存 */
export function clearResolvedShellCache(): void {
  cached = null;
}

export function formatShellToolHint(shell: ResolvedShell): string {
  const where = shell.path ? ` at \`${shell.path}\`` : '';
  if (shell.kind === 'pwsh' || shell.kind === 'powershell') {
    return (
      `Current shell: ${shell.label}${where}. ` +
      'Write PowerShell; do not assume bash/POSIX unless invoking bash.exe explicitly.'
    );
  }
  return (
    `Current shell: ${shell.label}${where}. ` +
    'Write POSIX/bash; do not assume cmd.exe or PowerShell unless invoking them explicitly.'
  );
}

export function shellSpawnArgs(
  shell: ResolvedShell,
  command: string,
): { command: string; args: string[] } {
  if (shell.kind === 'pwsh' || shell.kind === 'powershell') {
    return {
      command: shell.path,
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        // 双保险：即使未走隐藏控制台宿主，也尽量不弹出 PS 窗口
        '-WindowStyle',
        'Hidden',
        '-Command',
        command,
      ],
    };
  }
  return {
    command: shell.path,
    args: ['-lc', command],
  };
}
