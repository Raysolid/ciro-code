import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ExtensionHost, ExtensionTrustStore, McpManager, ProviderStore, SessionStore, SkillRegistry } from '@ciro-code/harness-core';
import type { HarnessMode, ModeProfileProvider } from '@ciro-code/harness-shared';
import { createMinimalModeProfiles } from '@ciro-code/harness-shared';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import { createHarnessApp } from './app.js';

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
  });

  // Product UX (banner / URLs / browser) is owned by `@ciro-code/cli`.
  const server = serve({
    fetch: app.fetch,
    port: config.bind.port,
    hostname: config.bind.host,
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
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
