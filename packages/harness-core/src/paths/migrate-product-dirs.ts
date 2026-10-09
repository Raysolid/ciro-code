import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  auditDbPath,
  globalAgentsFilePath,
  globalConfigPath,
  globalSkillsDir,
  homeRoot,
  legacyAuditDbPath,
  legacyGlobalAgentsFilePath,
  legacyGlobalConfigPath,
  legacyGlobalSkillsDir,
  legacyHomeRoot,
  legacyMemoryDir,
  legacyPlansDir,
  legacyProjectConfigPath,
  legacyProjectSkillsDir,
  legacyProviderKeysPath,
  legacyProvidersPath,
  legacyRecentWorkspacesPath,
  legacySessionsRoot,
  legacyWsRoot,
  memoryDir,
  plansDir,
  projectConfigPath,
  projectSkillsDir,
  providerKeysPath,
  providersPath,
  recentWorkspacesPath,
  sessionsRoot,
  wsRoot,
} from './product-paths.js';

export type DoctorFinding = {
  level: 'ok' | 'warn' | 'info';
  message: string;
};

export type DoctorReport = {
  homeRoot: string;
  legacyHomeRoot: string;
  workspace?: string;
  wsRoot?: string;
  legacyWsRoot?: string;
  findings: DoctorFinding[];
};

function dirNonEmpty(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return readdirSync(path).length > 0;
  } catch {
    return false;
  }
}

/** 扫描新旧产品目录，提示是否需要 migrate */
export function runDoctor(opts: { workspace?: string } = {}): DoctorReport {
  const findings: DoctorFinding[] = [];
  const home = homeRoot();
  const legacyHome = legacyHomeRoot();

  if (existsSync(home)) {
    findings.push({ level: 'ok', message: `home product root exists: ${home}` });
  } else {
    findings.push({
      level: 'info',
      message: `home product root missing (will be created on first write): ${home}`,
    });
  }

  if (dirNonEmpty(legacyHome) || existsSync(legacyGlobalConfigPath()) || existsSync(legacyProvidersPath())) {
    findings.push({
      level: 'warn',
      message: `legacy home data found at ${legacyHome}; run \`ciro migrate\` (does not delete old files)`,
    });
  } else {
    findings.push({ level: 'ok', message: 'no legacy ~/.pi/agent product data detected' });
  }

  const report: DoctorReport = {
    homeRoot: home,
    legacyHomeRoot: legacyHome,
    findings,
  };

  if (opts.workspace) {
    const ws = opts.workspace;
    report.workspace = ws;
    report.wsRoot = wsRoot(ws);
    report.legacyWsRoot = legacyWsRoot(ws);

    if (existsSync(wsRoot(ws))) {
      findings.push({ level: 'ok', message: `workspace product root exists: ${wsRoot(ws)}` });
    } else {
      findings.push({
        level: 'info',
        message: `workspace .ciro missing (ok for fresh clone): ${wsRoot(ws)}`,
      });
    }

    if (dirNonEmpty(legacyWsRoot(ws))) {
      findings.push({
        level: 'warn',
        message: `legacy workspace .pi found at ${legacyWsRoot(ws)}; run \`ciro migrate -w <workspace>\``,
      });
    } else {
      findings.push({ level: 'ok', message: 'no legacy workspace .pi product data detected' });
    }
  }

  return report;
}

export type MigrateResult = {
  copied: string[];
  skipped: string[];
  errors: string[];
};

function copyFileIfNeeded(
  src: string,
  dest: string,
  result: MigrateResult,
  label: string,
): void {
  if (!existsSync(src)) return;
  if (existsSync(dest)) {
    result.skipped.push(`${label}: destination exists (${dest})`);
    return;
  }
  try {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    result.copied.push(`${label}: ${src} → ${dest}`);
  } catch (e) {
    result.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function copyDirIfNeeded(
  src: string,
  dest: string,
  result: MigrateResult,
  label: string,
): void {
  if (!existsSync(src)) return;
  let st;
  try {
    st = statSync(src);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  if (existsSync(dest) && dirNonEmpty(dest)) {
    result.skipped.push(`${label}: destination non-empty (${dest})`);
    return;
  }
  try {
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
    result.copied.push(`${label}: ${src} → ${dest}`);
  } catch (e) {
    result.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 将旧 `.pi` / `~/.pi/agent` 复制到 `.ciro` / `~/.ciro`。
 * 不删除旧目录；目标已存在则跳过该条目。
 */
export function migrateProductDirs(opts: { workspace?: string } = {}): MigrateResult {
  const result: MigrateResult = { copied: [], skipped: [], errors: [] };

  mkdirSync(homeRoot(), { recursive: true });

  copyFileIfNeeded(legacyGlobalConfigPath(), globalConfigPath(), result, 'global config');
  copyFileIfNeeded(legacyProvidersPath(), providersPath(), result, 'providers');
  copyFileIfNeeded(legacyProviderKeysPath(), providerKeysPath(), result, 'provider keys');
  copyFileIfNeeded(legacyRecentWorkspacesPath(), recentWorkspacesPath(), result, 'recent workspaces');
  copyFileIfNeeded(legacyGlobalAgentsFilePath(), globalAgentsFilePath(), result, 'global AGENTS.md');
  copyFileIfNeeded(legacyAuditDbPath(), auditDbPath(), result, 'audit.db');
  copyDirIfNeeded(legacySessionsRoot(), sessionsRoot(), result, 'sessions');
  copyDirIfNeeded(legacyGlobalSkillsDir(), globalSkillsDir(), result, 'global skills');

  if (opts.workspace) {
    const ws = opts.workspace;
    mkdirSync(wsRoot(ws), { recursive: true });
    copyFileIfNeeded(legacyProjectConfigPath(ws), projectConfigPath(ws), result, 'project config');
    copyDirIfNeeded(legacyMemoryDir(ws), memoryDir(ws), result, 'memory');
    copyDirIfNeeded(legacyProjectSkillsDir(ws), projectSkillsDir(ws), result, 'project skills');
    copyDirIfNeeded(legacyPlansDir(ws), plansDir(ws), result, 'plans');
    const legacyDebug = join(legacyWsRoot(ws), 'debug');
    const primaryDebug = join(wsRoot(ws), 'debug');
    copyDirIfNeeded(legacyDebug, primaryDebug, result, 'debug');
    const legacySess = join(legacyWsRoot(ws), 'sessions');
    const primarySess = join(wsRoot(ws), 'sessions');
    copyDirIfNeeded(legacySess, primarySess, result, 'workspace sessions');
  }

  return result;
}
