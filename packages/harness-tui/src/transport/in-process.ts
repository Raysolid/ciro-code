import {
  ExtensionHost,
  ExtensionTrustStore,
  getWorkspaceGitStatus,
  loadConfig,
  McpManager,
  ProviderStore,
  SessionStore,
  SkillRegistry,
  type AgentRuntime,
} from '@ciro-code/harness-core';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import type { CompactSessionOptions } from '@ciro-code/harness-core';
import type {
  HarnessMode,
  ModeProfileProvider,
  ModelRef,
  PlanQuestionResolveBody,
  SessionCreateOptions,
  ThinkingLevel,
  UserMessage,
} from '@ciro-code/harness-shared';
import { createMinimalModeProfiles } from '@ciro-code/harness-shared';
import { redirectConsoleToFile } from '../terminal/console-redirect.js';
import type { AvailableModel, ResumeResult, TuiTransport, TurnCtxLite } from './types.js';

export interface InProcessTransportOptions {
  workspace: string;
  mode?: HarnessMode;
  agentBackend?: 'pi' | 'mock';
  profile?: string;
  modeProfiles?: ModeProfileProvider;
  /** allowConcurrent 时新建会话 id 加此前缀 */
  sessionIdPrefix?: string;
}

export function createInProcessTransport(opts: InProcessTransportOptions): TuiTransport {
  const restoreConsole = redirectConsoleToFile();
  const config = loadConfig({
    workspace: opts.workspace,
    mode: opts.mode,
    agentBackend: opts.agentBackend,
    profile: opts.profile,
  });

  const sessionStore = new SessionStore();
  const providerStore = new ProviderStore();
  const mcpManager = new McpManager({ workspace: config.workspace });
  const extensionTrustStore = new ExtensionTrustStore();
  const extensionHost = new ExtensionHost({ store: extensionTrustStore });
  const skillRegistry = new SkillRegistry({
    workspace: config.workspace,
    maxInjectTokens: config.skill.maxInjectTokens,
  });

  const runtime: AgentRuntime = createAgentRuntime(config, {
    sessionStore,
    providerStore,
    mcpManager,
    extensionHost,
    skillRegistry,
    modeProfiles: opts.modeProfiles ?? createMinimalModeProfiles(),
  });

  const prefix = opts.sessionIdPrefix;

  const transport: TuiTransport = {
    kind: 'in-process',

    async createSession(createOpts: SessionCreateOptions) {
      const sessionId =
        createOpts.sessionId ??
        (prefix ? `${prefix}${crypto.randomUUID()}` : undefined);
      return runtime.createSession({
        ...createOpts,
        ...(sessionId ? { sessionId } : {}),
      });
    },

    async resumeSession(id): Promise<ResumeResult> {
      const out = await runtime.resumeSession(id);
      return {
        session: out.session,
        messages: out.messages,
        contextUsage: out.contextUsage,
        confirmedPlanId: out.confirmedPlanId,
      };
    },

    async deleteSession(id) {
      await runtime.deleteSession(id);
    },

    setMode: (id, mode) => runtime.setMode(id, mode),
    setModelRef: (id, modelRef) => runtime.setModelRef(id, modelRef),
    setThinkingLevel: (id, level) => runtime.setThinkingLevel(id, level),
    setTitle: (id, title) => runtime.setSessionTitle(id, title),
    setMaxMode: (id, maxMode) => runtime.setMaxMode(id, maxMode),

    async listSessions() {
      return sessionStore.list();
    },

    async listAvailableModels(): Promise<AvailableModel[]> {
      const available = providerStore.listAvailable();
      const out: AvailableModel[] = [];
      for (const g of available.groups) {
        for (const m of g.models) {
          out.push({
            modelRef: { providerId: g.providerId, modelId: m.id },
            label: m.label || m.id,
          });
        }
      }
      return out;
    },

    async *send(sessionId, msg: UserMessage, turn?: TurnCtxLite) {
      const session = runtime.getSession(sessionId);
      if (turn?.mode) await runtime.setMode(sessionId, turn.mode);
      if (turn?.modelRef) await runtime.setModelRef(sessionId, turn.modelRef);
      if (turn?.thinkingLevel) await runtime.setThinkingLevel(sessionId, turn.thinkingLevel);
      if (turn?.maxMode != null) await runtime.setMaxMode(sessionId, turn.maxMode);
      const mode = turn?.mode ?? session?.mode ?? config.mode;
      yield* runtime.sendMessage(sessionId, msg, {
        sessionId,
        mode,
        workspace: session?.workspace ?? config.workspace,
      });
    },

    attach(sessionId, fromSeq) {
      return runtime.attachMessage(sessionId, fromSeq != null ? { fromSeq } : undefined);
    },

    abort: (id) => runtime.abort(id),
    subscribeActivity: () => runtime.subscribeSessionActivity(),

    resolvePermission: (id, decision) => runtime.resolvePermission(id, decision),
    resolveModeSuggest: (id, decision) => runtime.resolveModeSuggest(id, decision),
    resolvePlanQuestion: (qid, body: PlanQuestionResolveBody) =>
      runtime.resolvePlanQuestion(qid, body),

    getContextUsage: (id) => runtime.getContextUsage(id),
    compact: (id, method?: CompactSessionOptions) => runtime.compactSession(id, method),

    listPlans: (id) => runtime.listPlans(id),
    getPlan: (id, planId) => runtime.getPlan(id, planId),
    confirmPlan: (id, planId) => runtime.confirmPlan(id, planId),

    listFileChanges: (id) => runtime.listFileChanges(id),
    acceptFileChange: (id, path) => runtime.acceptFileChange(id, path),
    rejectFileChange: (id, path) => runtime.rejectFileChange(id, path),

    listSubagents: (id) => runtime.listSubagents(id),
    getSubagent: (id, taskId) => runtime.getSubagent(id, taskId),
    abortSubagent: (id, taskId) => runtime.abortSubagent(id, taskId),

    getDebugSession: (id) => runtime.getDebugSession(id),
    proceedDebug: (id) => runtime.proceedDebug(id),
    markDebugFixed: (id) => runtime.markDebugFixed(id),

    async getGitStatus() {
      try {
        return await getWorkspaceGitStatus(config.workspace);
      } catch {
        return undefined;
      }
    },

    dispose() {
      restoreConsole();
    },
  };

  return transport;
}

// silence unused import lint for ModelRef/ThinkingLevel re-exports used by callers via types
export type { ModelRef, ThinkingLevel };
