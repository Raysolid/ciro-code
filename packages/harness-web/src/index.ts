import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireWorkspaceLock,
  clearDaemonRegistry,
  loadConfig,
  ExtensionHost,
  ExtensionTrustStore,
  McpManager,
  ProviderStore,
  releaseWorkspaceLock,
  SessionStore,
  SkillRegistry,
  writeDaemonRegistry,
} from '@ciro-code/harness-core';
import type { HarnessMode, ModeProfileProvider } from '@ciro-code/harness-shared';
import { createMinimalModeProfiles } from '@ciro-code/harness-shared';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import { createHarnessApp } from './app.js';
import { DaemonClientPresence } from './daemon/client-presence.js';

function resolveDefaultUiDist(): string | undefined {
  const candidate = resolve(
    fileURLToPath(new URL('../../harness-ui/dist', import.meta.url)),
  );
  return existsSync(candidate) ? candidate : undefined;
}

export interface StartServerOptions {
  workspace?: string;
  port?: number;
  host?: string;
  mode?: HarnessMode;
  agentBackend?: 'pi' | 'mock';
  /** Profile overlay id（`--profile=`） */
  profile?: string;
  uiDistPath?: string;
  /** CLI 显式传入 -w 时为 true，跳过 Recent 自动恢复覆盖 */
  workspacePinned?: boolean;
  /** 四模式 Profile；缺省 minimal stub（产品路径由 CLI 注入） */
  modeProfiles?: ModeProfileProvider;
  /** 与 TUI 工作区互斥；默认 true */
  workspaceLock?: boolean;
}

export async function startHarnessServer(options: StartServerOptions = {}) {
  const config = loadConfig({
    workspace: options.workspace,
    port: options.port,
    host: options.host,
    mode: options.mode,
    agentBackend: options.agentBackend,
    profile: options.profile,
  });

  if (options.workspaceLock !== false) {
    const lock = acquireWorkspaceLock(config.workspace, 'web');
    if (!lock.ok) {
      const e = lock.existing;
      throw new Error(
        e.kind === 'tui'
          ? `TUI 运行中（pid ${e.pid}）。请先退出，或对 TUI 使用 --allow-concurrent`
          : `另一 Web daemon 运行中（pid ${e.pid}）`,
      );
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseWorkspaceLock(config.workspace);
    };
    process.on('exit', release);
    process.on('beforeExit', release);
    process.on('SIGINT', () => {
      release();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      release();
      process.exit(0);
    });
    process.on('uncaughtException', (err) => {
      release();
      console.error(err);
      process.exit(1);
    });
  }

  const uiDistPath = options.uiDistPath ?? resolveDefaultUiDist();

  const sessionStore = new SessionStore();
  // 必须与 createHarnessApp 共用同一 ProviderStore，否则设置页 Key 无法注入对话 runtime
  const providerStore = new ProviderStore();
  // 必须与 createHarnessApp / API 共用同一 McpManager，否则设置本轮启用与对话工具表脱节
  const mcpManager = new McpManager({ workspace: config.workspace });
  // 必须与 createHarnessApp / 设置页共用同一 Host，否则 Trust 不进对话工具表
  const extensionTrustStore = new ExtensionTrustStore();
  const extensionHost = new ExtensionHost({ store: extensionTrustStore });
  const skillRegistry = new SkillRegistry({
    workspace: config.workspace,
    maxInjectTokens: config.skill.maxInjectTokens,
  });
  const runtime = createAgentRuntime(config, {
    sessionStore,
    providerStore,
    mcpManager,
    extensionHost,
    skillRegistry,
    modeProfiles: options.modeProfiles ?? createMinimalModeProfiles(),
  });

  const autoStop = process.env.CIRO_DAEMON_AUTO_STOP === '1';
  let shuttingDown = false;
  let server: ReturnType<typeof serve> | undefined;
  let clientPresence: DaemonClientPresence | undefined;
  const requestStop = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      clientPresence?.dispose();
    } catch {
      /* ignore */
    }
    try {
      clearDaemonRegistry(config.workspace);
    } catch {
      /* ignore */
    }
    try {
      server?.close();
    } catch {
      /* ignore */
    }
    process.exit(code);
  };

  // lease：心跳续租；显式 leave / 失联 TTL → 无客户端则停（对齐本地 agent daemon 惯例）
  clientPresence = autoStop
    ? new DaemonClientPresence({
        graceMs: 3_000,
        staleMs: 30_000,
        sweepMs: 5_000,
        onEmpty: () => {
          console.log('[daemon] no clients left — shutting down');
          requestStop(0);
        },
      })
    : undefined;

  const app = createHarnessApp({
    config,
    runtime,
    sessionStore,
    providerStore,
    mcpManager,
    extensionTrustStore,
    extensionHost,
    skillRegistry,
    uiDistPath,
    workspacePinned: options.workspacePinned,
    clientPresence,
  });

  // Product UX (banner / URLs / browser) is owned by `@ciro-code/cli`.
  server = serve({
    fetch: app.fetch,
    port: config.bind.port,
    hostname: config.bind.host,
  });

  writeDaemonRegistry({
    pid: process.pid,
    port: config.bind.port,
    host: config.bind.host,
    workspace: config.workspace,
    startedAt: Date.now(),
  });

  if (clientPresence) {
    // spawn 后给 TUI/Web 登记窗口，避免首连前误杀
    clientPresence.holdBootstrap(15_000);
  }

  const clearRegistry = () => {
    try {
      clearDaemonRegistry(config.workspace);
    } catch {
      // ignore
    }
  };
  process.on('exit', clearRegistry);
  // 注意：仅挂 clearRegistry 而不 exit 会覆盖 Node 默认 SIGINT 退出 → 僵尸占端口
  process.on('SIGINT', () => requestStop(0));
  process.on('SIGTERM', () => requestStop(0));

  server.on('error', (err: NodeJS.ErrnoException) => {
    clearRegistry();
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${config.bind.port} already in use (EADDRINUSE). Stop the other process or pass -p <port>.`
        : err,
    );
    process.exit(1);
  });

  return { server, config, app };
}

export { createHarnessApp } from './app.js';
