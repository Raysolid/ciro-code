import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 工作区产品目录（新写） */
export const WS_DIR = '.ciro';
/** 工作区旧目录（只读兼容） */
export const LEGACY_WS_DIR = '.pi';

/** 展示用全局 AGENTS 路径 */
export const DISPLAY_GLOBAL_AGENTS = '~/.ciro/AGENTS.md';
/** 展示用项目 MEMORY */
export const DISPLAY_MEMORY_MD = '.ciro/memory/MEMORY.md';
export const DISPLAY_SESSION_MEMORY = '.ciro/memory/session-memory.md';

export type ResolvedPath = {
  path: string;
  /** true = 选用了旧路径（应 warn / 提示 migrate） */
  fromLegacy: boolean;
};

/** 用户级产品根 `~/.ciro` */
export function homeRoot(): string {
  return join(homedir(), '.ciro');
}

/** 旧用户级根 `~/.pi/agent` */
export function legacyHomeRoot(): string {
  return join(homedir(), '.pi', 'agent');
}

/** 工作区产品根 `{ws}/.ciro` */
export function wsRoot(workspace: string): string {
  return join(workspace, WS_DIR);
}

export function legacyWsRoot(workspace: string): string {
  return join(workspace, LEGACY_WS_DIR);
}

/**
 * 读路径解析：primary 存在则用；否则 legacy；都不存在则返回 primary（供随后创建）。
 * 唯一旧路径兼容入口——调用方勿再各自 fallback。
 */
export function resolveReadable(primary: string, legacy: string): ResolvedPath {
  if (existsSync(primary)) return { path: primary, fromLegacy: false };
  if (existsSync(legacy)) return { path: legacy, fromLegacy: true };
  return { path: primary, fromLegacy: false };
}

/** 目录版：与 resolveReadable 相同语义 */
export function resolveReadableDir(primary: string, legacy: string): ResolvedPath {
  return resolveReadable(primary, legacy);
}

// —— 全局文件 ——

export function globalConfigPath(): string {
  return join(homeRoot(), 'config.yaml');
}

export function legacyGlobalConfigPath(): string {
  return join(legacyHomeRoot(), 'config.yaml');
}

export function providersPath(): string {
  return join(homeRoot(), 'providers.json');
}

export function legacyProvidersPath(): string {
  return join(legacyHomeRoot(), 'providers.json');
}

export function providerKeysPath(): string {
  return join(homeRoot(), 'credentials', 'provider-keys.json');
}

export function legacyProviderKeysPath(): string {
  return join(legacyHomeRoot(), 'credentials', 'provider-keys.json');
}

export function sessionsRoot(): string {
  return join(homeRoot(), 'sessions');
}

export function legacySessionsRoot(): string {
  return join(legacyHomeRoot(), 'sessions');
}

export function recentWorkspacesPath(): string {
  return join(homeRoot(), 'recent-workspaces.json');
}

export function legacyRecentWorkspacesPath(): string {
  return join(legacyHomeRoot(), 'recent-workspaces.json');
}

export function auditDbPath(): string {
  return join(homeRoot(), 'audit.db');
}

export function legacyAuditDbPath(): string {
  return join(legacyHomeRoot(), 'audit.db');
}

export function globalAgentsFilePath(): string {
  return join(homeRoot(), 'AGENTS.md');
}

export function legacyGlobalAgentsFilePath(): string {
  return join(legacyHomeRoot(), 'AGENTS.md');
}

export function globalSkillsDir(): string {
  return join(homeRoot(), 'skills');
}

export function legacyGlobalSkillsDir(): string {
  return join(legacyHomeRoot(), 'skills');
}

/** 官方功能扩展安装根 `~/.ciro/packs` */
export function packsDir(): string {
  return join(homeRoot(), 'packs');
}

/** 已装 Pack 模块目录 `~/.ciro/packs/modules` */
export function packsModulesDir(): string {
  return join(packsDir(), 'modules');
}

export function packsEnabledPath(): string {
  return join(packsDir(), 'enabled.json');
}

/** Agent Extension 发现根 `~/.ciro/extensions`（§9.2 Trust） */
export function extensionsDir(): string {
  return join(homeRoot(), 'extensions');
}

/** Extension Trust 白名单 `~/.ciro/extensions/trust.json` */
export function extensionsTrustPath(): string {
  return join(extensionsDir(), 'trust.json');
}

/** 用户级权限目录 `~/.ciro/permissions` */
export function permissionsDir(): string {
  return join(homeRoot(), 'permissions');
}

/** Shell 命令白名单 `~/.ciro/permissions/shell-allowlist.json` */
export function shellAllowlistPath(): string {
  return join(permissionsDir(), 'shell-allowlist.json');
}

// —— 工作区文件 ——

export function projectConfigPath(workspace: string): string {
  return join(wsRoot(workspace), 'config.yaml');
}

export function legacyProjectConfigPath(workspace: string): string {
  return join(legacyWsRoot(workspace), 'config.yaml');
}

export function memoryDir(workspace: string): string {
  return join(wsRoot(workspace), 'memory');
}

export function legacyMemoryDir(workspace: string): string {
  return join(legacyWsRoot(workspace), 'memory');
}

export function projectSkillsDir(workspace: string): string {
  return join(wsRoot(workspace), 'skills');
}

export function legacyProjectSkillsDir(workspace: string): string {
  return join(legacyWsRoot(workspace), 'skills');
}

/** 工作区 Rules：`{ws}/.ciro/rules` */
export function projectRulesDir(workspace: string): string {
  return join(wsRoot(workspace), 'rules');
}

/** 用户级 Rules：`~/.ciro/rules` */
export function globalRulesDir(): string {
  return join(homeRoot(), 'rules');
}

/** 工作区 MCP 配置：`{ws}/.mcp.json`（业界惯例，根目录） */
export function projectMcpConfigPath(workspace: string): string {
  return join(workspace, '.mcp.json');
}

/** 用户级 MCP：`~/.ciro/mcp.json` */
export function globalMcpConfigPath(): string {
  return join(homeRoot(), 'mcp.json');
}

export function plansDir(workspace: string): string {
  return join(wsRoot(workspace), 'plans');
}

export function legacyPlansDir(workspace: string): string {
  return join(legacyWsRoot(workspace), 'plans');
}

export function debugDir(workspace: string): string {
  return join(wsRoot(workspace), 'debug');
}

export function legacyDebugDir(workspace: string): string {
  return join(legacyWsRoot(workspace), 'debug');
}

export function workspaceSessionsDir(workspace: string, sessionId: string): string {
  return join(wsRoot(workspace), 'sessions', sessionId);
}

export function legacyWorkspaceSessionsDir(workspace: string, sessionId: string): string {
  return join(legacyWsRoot(workspace), 'sessions', sessionId);
}

/** Pi SDK agentDir（产品与 Pi 边界） */
export function piAgentDir(workspace: string): string {
  return join(wsRoot(workspace), 'pi-agent');
}

/** 迁移期 warn 文案 */
export function legacyPathWarning(kind: string, legacyPath: string): string {
  return `${kind} is using legacy path ${legacyPath}; run \`ciro migrate\` to move to .ciro / ~/.ciro`;
}
