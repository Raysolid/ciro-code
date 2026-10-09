import type { HarnessConfig, HarnessMode, ModelRef, ThinkingLevel } from '@ciro/harness-shared';
import {
  MemoryStore,
  RuleRegistry,
  McpManager,
  SessionRecoveryManager,
  SkillRegistry,
  pushRecentWorkspace,
  type AgentRuntime,
  type ContextAccountant,
  type ExtensionHost,
  type ExtensionTrustStore,
  type PackStore,
  type ProviderStore,
  type SessionStore,
  type ShellAllowlistStore,
} from '@ciro/harness-core';
import { basename, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

export function toSessionJson(
  session: {
    id: string;
    workspace: string;
    mode: HarnessMode;
    createdAt: number;
    modelRef?: ModelRef;
    title?: string;
    thinkingLevel?: ThinkingLevel;
    maxMode?: boolean;
  },
  messageCount = 0,
  busy = false,
) {
  return {
    id: session.id,
    workspace: session.workspace,
    mode: session.mode,
    createdAt: session.createdAt,
    modelRef: session.modelRef,
    title: session.title,
    thinkingLevel: session.thinkingLevel,
    maxMode: session.maxMode,
    messageCount,
    busy,
  };
}

export function sameWorkspacePath(a: string, b: string): boolean {
  return (
    resolve(a).replace(/[\\/]+$/, '').toLowerCase() ===
    resolve(b).replace(/[\\/]+$/, '').toLowerCase()
  );
}

export interface AppServices {
  memoryStore: MemoryStore;
  skillRegistry: SkillRegistry;
  ruleRegistry: RuleRegistry;
  mcpManager: McpManager;
}

export interface AppContext {
  config: HarnessConfig;
  runtime: AgentRuntime;
  sessionStore: SessionStore;
  contextAccountant: ContextAccountant;
  providerStore: ProviderStore;
  packStore: PackStore;
  extensionTrustStore: ExtensionTrustStore;
  extensionHost: ExtensionHost;
  shellAllowlist: ShellAllowlistStore;
  services: AppServices;
  getWorkspaceSelected: () => boolean;
  setWorkspaceSelected: (v: boolean) => void;
  setWorkspace: (rawPath: string) => {
    workspace: string;
    name: string;
    recent: string[];
    selected: true;
  };
  listSessionsJson: () => ReturnType<typeof toSessionJson>[];
  uiDistPath?: string;
}

export function createListSessionsJson(
  sessionStore: SessionStore,
  isBusy?: (sessionId: string) => boolean,
) {
  return () => {
    const mem = new Map(sessionStore.list().map((s) => [s.id, s]));
    const counts = new Map<string, number>();
    if (sessionStore.eventLog) {
      const recovery = new SessionRecoveryManager(sessionStore.eventLog);
      for (const meta of recovery.listPersistedMeta()) {
        counts.set(meta.sessionId, meta.currentState.messageCount ?? 0);
        if (!mem.has(meta.sessionId)) {
          mem.set(meta.sessionId, {
            id: meta.sessionId,
            workspace: meta.workspace,
            mode: meta.currentState.mode,
            createdAt: meta.currentState.createdAt,
            modelRef: meta.currentState.modelRef,
            title: meta.currentState.title,
          });
        } else {
          const existing = mem.get(meta.sessionId)!;
          if (!existing.title && meta.currentState.title) {
            mem.set(meta.sessionId, { ...existing, title: meta.currentState.title });
          }
        }
      }
    }
    return [...mem.values()]
      .map((s) => toSessionJson(s, counts.get(s.id) ?? 0, isBusy?.(s.id) ?? false))
      .filter((s) => s.messageCount > 0)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  };
}

export function bindSetWorkspace(opts: {
  config: HarnessConfig;
  services: AppServices;
  runtime: AgentRuntime;
  setWorkspaceSelected: (v: boolean) => void;
}) {
  return (rawPath: string) => {
    const workspace = resolve(rawPath);
    if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
      throw new Error(`Not a directory: ${workspace}`);
    }
    opts.config.workspace = workspace;
    opts.services.memoryStore = new MemoryStore(workspace);
    opts.services.skillRegistry.rebind(workspace);
    opts.services.ruleRegistry = new RuleRegistry({ workspace });
    opts.services.mcpManager = new McpManager({ workspace });
    opts.runtime.rebindWorkspace(workspace, {
      memoryStore: opts.services.memoryStore,
      mcpManager: opts.services.mcpManager,
      skillRegistry: opts.services.skillRegistry,
    });
    const recent = pushRecentWorkspace(workspace);
    opts.setWorkspaceSelected(true);
    return {
      workspace,
      name: basename(workspace),
      recent,
      selected: true as const,
    };
  };
}
