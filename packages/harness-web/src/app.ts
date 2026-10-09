import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HarnessConfig } from '@ciro/harness-shared';
import { createMinimalModeProfiles } from '@ciro/harness-shared';
import {
  ContextAccountant,
  MemoryStore,
  ExtensionHost,
  ExtensionTrustStore,
  PackStore,
  ProviderStore,
  RuleRegistry,
  McpManager,
  SessionStore,
  ShellAllowlistStore,
  SkillRegistry,
  readRecentWorkspaces,
  type AgentRuntime,
} from '@ciro/harness-core';
import { createAgentRuntime } from '@ciro/harness-pi';
import {
  bindSetWorkspace,
  createListSessionsJson,
  type AppContext,
  type AppServices,
} from './app-context.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerFileRoutes } from './routes/files.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerPackRoutes } from './routes/packs.js';
import { registerExtensionRoutes } from './routes/extensions.js';
import { registerGitRoutes } from './routes/git.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerMcpRoutes } from './routes/mcp.js';

export interface CreateAppOptions {
  config: HarnessConfig;
  runtime?: AgentRuntime;
  sessionStore?: SessionStore;
  memoryStore?: MemoryStore;
  contextAccountant?: ContextAccountant;
  providerStore?: ProviderStore;
  packStore?: PackStore;
  extensionTrustStore?: ExtensionTrustStore;
  extensionHost?: ExtensionHost;
  mcpManager?: McpManager;
  skillRegistry?: SkillRegistry;
  uiDistPath?: string;
  /** true：CLI 显式 -w，视为已选中；false/缺省：优先恢复 Recent 上次工作区 */
  workspacePinned?: boolean;
}

export function createHarnessApp(options: CreateAppOptions) {
  const { config, uiDistPath } = options;
  const sessionStore =
    options.sessionStore ??
    new SessionStore({
      snapshotInterval: config.session.snapshotInterval,
    });
  const contextAccountant =
    options.contextAccountant ??
    new ContextAccountant({
      modelContextLimit: config.modelContextLimit,
      reservedOutputTokens: config.reservedOutputTokens,
      compaction: config.compaction,
    });
  const providerStore = options.providerStore ?? new ProviderStore();
  const packStore = options.packStore ?? new PackStore();
  packStore.ensureLayout();
  const extensionTrustStore =
    options.extensionTrustStore ?? new ExtensionTrustStore();
  extensionTrustStore.ensureLayout();
  const extensionHost =
    options.extensionHost ?? new ExtensionHost({ store: extensionTrustStore });
  void extensionHost.ensureLoaded();

  const services: AppServices = {
    memoryStore:
      options.memoryStore ?? new MemoryStore(config.workspace),
    skillRegistry:
      options.skillRegistry ??
      new SkillRegistry({
        workspace: config.workspace,
        maxInjectTokens: config.skill.maxInjectTokens,
      }),
    ruleRegistry: new RuleRegistry({ workspace: config.workspace }),
    mcpManager: options.mcpManager ?? new McpManager({ workspace: config.workspace }),
  };

  const shellAllowlist = new ShellAllowlistStore();

  const runtime =
    options.runtime ??
    createAgentRuntime(config, {
      sessionStore,
      memoryStore: services.memoryStore,
      contextAccountant,
      providerStore,
      mcpManager: services.mcpManager,
      extensionHost,
      skillRegistry: services.skillRegistry,
      shellAllowlist,
      modeProfiles: createMinimalModeProfiles(),
    });

  const purged = sessionStore.purgeEmpty();
  if (purged.length > 0) {
    console.log(`[sessions] purged ${purged.length} empty session(s)`);
  }

  let workspaceSelected = false;
  const setWorkspaceSelected = (v: boolean) => {
    workspaceSelected = v;
  };
  const getWorkspaceSelected = () => workspaceSelected;

  const setWorkspace = bindSetWorkspace({
    config,
    services,
    runtime,
    setWorkspaceSelected,
  });
  const listSessionsJson = createListSessionsJson(sessionStore, (id) =>
    runtime.isSessionBusy(id),
  );

  if (options.workspacePinned === true) {
    setWorkspace(config.workspace);
  } else if (options.workspacePinned === false) {
    const last = readRecentWorkspaces()[0];
    if (last) {
      setWorkspace(last);
      console.log(`[workspace] restored ${last}`);
    }
  }

  const ctx: AppContext = {
    config,
    runtime,
    sessionStore,
    contextAccountant,
    providerStore,
    packStore,
    extensionTrustStore,
    extensionHost,
    shellAllowlist,
    services,
    getWorkspaceSelected,
    setWorkspaceSelected,
    setWorkspace,
    listSessionsJson,
    uiDistPath,
  };

  const app = new Hono();
  app.use('*', cors());

  registerWorkspaceRoutes(app, ctx);
  registerSessionRoutes(app, ctx);
  registerProviderRoutes(app, ctx);
  registerPackRoutes(app, ctx);
  registerExtensionRoutes(app, ctx);
  registerGitRoutes(app, ctx);
  registerRulesRoutes(app, ctx);
  registerMcpRoutes(app, ctx);
  registerMemoryRoutes(app, ctx);
  registerFileRoutes(app, ctx);
  registerChatRoutes(app, ctx);
  registerMiscRoutes(app, ctx);

  return app;
}
