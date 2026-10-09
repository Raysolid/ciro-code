import { join, relative } from 'node:path';
import {
  type CompactionResult,
  type ContextUsageSnapshot,
  type HarnessConfig,
  type HarnessMode,
  type ModeProfileProvider,
  type PlanRecord,
  type PlanSummary,
  type PlanQuestionResolveBody,
  type SessionHandle,
  type SseEnvelope,
  type ToolFilter,
  type ToolDefinition,
} from '@ciro/harness-shared';
import {
  assembleMemoryInjection,
  assembleRulesInjection,
  assembleSkillInjection,
  ChangeReviewStore,
  collectFileChanges,
  CompactionOrchestrator,
  ContextAccountant,
  MemoryStore,
  PermissionBroker,
  ModeSuggestBroker,
  PlanQuestionBroker,
  PlanStore,
  RuleRegistry,
  SessionRecoveryManager,
  SessionStore,
  SkillRegistry,
  ToolResultStore,
  uiMessagesFromEvents,
  workspaceSessionsDir,
  type AuditLog,
  type CompactSessionOptions,
  type RecoveredChatMessage,
  type RecoveredSessionState,
  type ToolResultRecord,
} from '@ciro/harness-core';
import { makeEnvelope } from '../sse/envelope.js';

export function toolsForMode(profiles: ModeProfileProvider, mode: HarnessMode): string[] {
  return [...profiles.toolsForMode(mode)];
}

export function resolveSessionDir(
  store: SessionStore,
  workspace: string,
  sessionId: string,
): string {
  const root = store.eventLog?.sessionsRoot;
  if (root) return join(root, sessionId);
  return workspaceSessionsDir(workspace, sessionId);
}

export function trackToolResultShared(
  toolResults: Map<string, ToolResultRecord[]>,
  sessionDir: string,
  sessionId: string,
  toolCallId: string,
  toolName: string,
  content: string,
): void {
  const list = toolResults.get(sessionId) ?? [];
  list.push({ toolCallId, toolName, content });
  toolResults.set(sessionId, list);
  new ToolResultStore(sessionDir).write(toolCallId, toolName, content, 'inline');
}

export async function compactSessionShared(opts: {
  store: SessionStore;
  context: ContextAccountant;
  compaction: CompactionOrchestrator;
  toolResults: Map<string, ToolResultRecord[]>;
  sessionDir: string;
  sessionId: string;
  modeProfiles: ModeProfileProvider;
  compactOpts?: CompactSessionOptions;
}): Promise<{ result: CompactionResult; contextUsage?: ContextUsageSnapshot }> {
  const { store, context, compaction, toolResults, sessionDir, sessionId, compactOpts } = opts;
  const session = store.get(sessionId);
  if (!session) throw new Error('Session not found');
  const outcome = await compaction.compact({
    sessionId,
    workspace: session.workspace,
    mode: session.mode,
    method: compactOpts?.method,
    conversationText: context.getConversation(sessionId),
    summarizedText: context.getSummarized(sessionId),
    toolResults: toolResults.get(sessionId) ?? [],
    sessionDir,
  });
  toolResults.set(sessionId, outcome.toolResults);
  context.setConversation(sessionId, outcome.conversationText);
  context.setSummarized(sessionId, outcome.summarizedText);
  const contextUsage = context.refresh(sessionId, {
    system: opts.modeProfiles.systemPromptForMode(session.mode),
    tools: toolsForMode(opts.modeProfiles, session.mode).join('\n'),
    conversation: outcome.conversationText,
    summarized: outcome.summarizedText,
  });
  store.appendEvent(sessionId, {
    type: 'compaction',
    method: outcome.result.metadata.method,
    tokensSaved: outcome.result.metadata.tokensSaved,
    narrative: outcome.result.narrative,
    conversation: outcome.conversationText,
    summarized: outcome.summarizedText,
  });
  return { result: outcome.result, contextUsage };
}

export function recoverSessionShared(
  store: SessionStore,
  context: ContextAccountant,
  toolResults: Map<string, ToolResultRecord[]>,
  sessionId: string,
  modeProfiles: ModeProfileProvider,
): {
  handle: SessionHandle;
  messageCount: number;
  eventsReplayed: number;
  stoppedAtBoundary: boolean;
  contextUsage?: ContextUsageSnapshot;
  messages: RecoveredSessionState['messages'];
  conversationText: string;
  summarizedText: string;
} {
  if (!store.eventLog) {
    throw new Error('Session persistence disabled');
  }
  const recovery = new SessionRecoveryManager(store.eventLog);
  const state = recovery.recover(sessionId);
  if (!state) throw new Error('Session not found on disk');

  store.adopt(state.handle);
  toolResults.set(sessionId, state.toolResults);
  context.setConversation(sessionId, state.conversationText);
  context.setSummarized(sessionId, state.summarizedText);
  const contextUsage = context.refresh(sessionId, {
    system: modeProfiles.systemPromptForMode(state.handle.mode),
    tools: toolsForMode(modeProfiles, state.handle.mode).join('\n'),
    conversation: state.conversationText,
    summarized: state.summarizedText,
  });
  return {
    handle: state.handle,
    messageCount: state.messageCount,
    eventsReplayed: state.eventsReplayed,
    stoppedAtBoundary: state.stoppedAtBoundary,
    contextUsage,
    messages: state.messages,
    conversationText: state.conversationText,
    summarizedText: state.summarizedText,
  };
}

export function listPlansShared(planStore: PlanStore, sessionId: string): PlanSummary[] {
  return planStore.list(sessionId);
}

export function latestConfirmedPlan(
  planStore: PlanStore,
  sessionId: string,
): PlanRecord | undefined {
  for (const summary of planStore.list(sessionId)) {
    if (!summary.confirmed) continue;
    const rec = planStore.read(sessionId, summary.planId);
    if (rec?.confirmedAt) return rec;
  }
  return undefined;
}

export function formatConfirmedPlanInjection(plan: PlanRecord): string {
  const todos = plan.todos.length
    ? `\n\nTodos (keep these ids; update with TodoWrite):\n${plan.todos
        .map((t) => `- [${t.status}] ${t.id}: ${t.content}`)
        .join('\n')}`
    : '';
  return `# Confirmed plan: ${plan.title}\n\n${plan.markdown}${todos}`;
}

export function listFileChangesShared(store: SessionStore, sessionId: string) {
  const events = store.eventLog?.readEvents(sessionId) ?? [];
  const session = store.get(sessionId);
  const sessionDir = session
    ? resolveSessionDir(store, session.workspace, sessionId)
    : store.eventLog
      ? join(store.eventLog.sessionsRoot, sessionId)
      : null;
  const reviews = sessionDir ? new ChangeReviewStore(sessionDir).listDispositions() : undefined;
  return collectFileChanges(events, reviews);
}

export function recordFileChangeReviewShared(
  store: SessionStore,
  sessionId: string,
  path: string,
  before: string,
  after: string,
): void {
  const session = store.get(sessionId);
  if (!session) return;
  const sessionDir = resolveSessionDir(store, session.workspace, sessionId);
  new ChangeReviewStore(sessionDir).recordEdit(path, before, after);
}

export function acceptFileChangeShared(
  store: SessionStore,
  sessionId: string,
  path: string,
) {
  const session = store.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const sessionDir = resolveSessionDir(store, session.workspace, sessionId);
  new ChangeReviewStore(sessionDir).accept(session.workspace, path);
  return listFileChangesShared(store, sessionId).find((c) => c.path === path);
}

export function rejectFileChangeShared(
  store: SessionStore,
  sessionId: string,
  path: string,
) {
  const session = store.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  const sessionDir = resolveSessionDir(store, session.workspace, sessionId);
  new ChangeReviewStore(sessionDir).reject(session.workspace, path);
  return listFileChangesShared(store, sessionId).find((c) => c.path === path);
}

export function getPlanShared(
  planStore: PlanStore,
  sessionId: string,
  planId: string,
): PlanRecord | undefined {
  return planStore.read(sessionId, planId);
}

export async function confirmPlanShared(
  store: SessionStore,
  planStore: PlanStore,
  sessionId: string,
  planId: string,
  setMode: (sessionId: string, mode: HarnessMode) => Promise<SessionHandle | undefined>,
): Promise<{ session: SessionHandle; plan: PlanRecord }> {
  const existing = store.get(sessionId);
  if (!existing) throw new Error('Session not found');
  const plan = planStore.markConfirmed(sessionId, planId);
  store.appendEvent(sessionId, {
    type: 'plan_confirmed',
    planId: plan.planId,
    title: plan.title,
    mode: 'agent',
  });
  const session = (await setMode(sessionId, 'agent')) ?? existing;
  return { session, plan };
}

export function savePlanToWorkspaceShared(
  store: SessionStore,
  planStore: PlanStore,
  sessionId: string,
  planId: string,
): { pathRel: string; plan: PlanRecord } {
  const session = store.get(sessionId);
  if (!session) throw new Error('Session not found');
  const out = planStore.saveToWorkspace(sessionId, planId, session.workspace);
  return { pathRel: out.pathRel, plan: out.plan };
}

export function rebindWorkspaceShared(
  config: HarnessConfig,
  workspace: string,
  opts?: { memoryStore?: MemoryStore; skillRegistry?: SkillRegistry },
): { memory: MemoryStore; skills: SkillRegistry; rules: RuleRegistry } {
  config.workspace = workspace;
  const memory = opts?.memoryStore ?? new MemoryStore(workspace);
  const skills =
    opts?.skillRegistry ??
    new SkillRegistry({
      workspace,
      maxInjectTokens: config.skill.maxInjectTokens,
    });
  if (opts?.skillRegistry) skills.rebind(workspace);
  const rules = new RuleRegistry({ workspace });
  return { memory, skills, rules };
}

export type SessionHistoryMessages = RecoveredChatMessage[];

export function refreshConversationFromUiMessagesShared(opts: {
  context: ContextAccountant;
  toolResults: Map<string, ToolResultRecord[]>;
  sessionId: string;
  handle: SessionHandle;
  messages: SessionHistoryMessages;
  modeProfiles: ModeProfileProvider;
}): void {
  const conversation = opts.messages
    .map((m) => (m.role === 'user' ? `\nUser: ${m.content}` : `\nAssistant: ${m.content}`))
    .join('');
  opts.context.refresh(opts.sessionId, {
    system: opts.modeProfiles.systemPromptForMode(opts.handle.mode),
    tools: toolsForMode(opts.modeProfiles, opts.handle.mode).join('\n'),
    conversation,
    summarized: '',
  });
  opts.toolResults.set(opts.sessionId, []);
}

export function resolveSessionHandleFromDiskShared(
  store: SessionStore,
  sessionId: string,
  inMemoryHandle?: SessionHandle,
): SessionHandle {
  let src = store.get(sessionId) ?? inMemoryHandle;
  if (!src && store.eventLog) {
    const meta = store.eventLog.readMeta(sessionId);
    if (meta) {
      src = {
        id: sessionId,
        workspace: meta.workspace,
        mode: meta.currentState.mode,
        createdAt: meta.currentState.createdAt,
        modelRef: meta.currentState.modelRef,
        title: meta.currentState.title,
      };
      store.adopt(src);
    }
  }
  if (!src) {
    throw new Error('SESSION_NOT_FOUND: Session not found');
  }
  return src;
}

export function truncateSessionHistoryShared(opts: {
  store: SessionStore;
  context: ContextAccountant;
  toolResults: Map<string, ToolResultRecord[]>;
  busySessions: Set<string>;
  sessionId: string;
  messageId: string;
  kind: 'rewind' | 'fork';
  modeProfiles: ModeProfileProvider;
  inMemoryHandle?: SessionHandle;
}): { session: SessionHandle; messages: SessionHistoryMessages } {
  const { store, sessionId, messageId, kind } = opts;
  if (opts.busySessions.has(sessionId)) {
    throw new Error('SESSION_BUSY: Session is streaming');
  }
  let handle = store.get(sessionId) ?? opts.inMemoryHandle;
  if (!handle) {
    throw new Error('SESSION_NOT_FOUND: Session not found');
  }
  if (!store.get(sessionId)) {
    store.adopt(handle);
  }

  store.truncateBeforeUserMessage(sessionId, messageId);
  store.appendEvent(sessionId, {
    type: kind,
    messageId,
    beforeMessageId: kind === 'rewind' ? messageId : undefined,
    fromMessageId: kind === 'fork' ? messageId : undefined,
  });

  const messages = uiMessagesFromEvents(store.eventLog?.readEvents(sessionId) ?? []);
  handle = store.get(sessionId) ?? handle;
  refreshConversationFromUiMessagesShared({
    context: opts.context,
    toolResults: opts.toolResults,
    sessionId,
    handle,
    messages,
    modeProfiles: opts.modeProfiles,
  });
  return { session: handle, messages };
}

export async function forkChatSessionShared(opts: {
  store: SessionStore;
  context: ContextAccountant;
  toolResults: Map<string, ToolResultRecord[]>;
  srcSessionId: string;
  throughMessageId: string;
  modeProfiles: ModeProfileProvider;
  inMemoryHandle?: SessionHandle;
  createSession: (options: {
    workspace: string;
    mode: HarnessMode;
    modelRef?: SessionHandle['modelRef'];
  }) => Promise<SessionHandle>;
  setSessionTitle: (
    sessionId: string,
    title: string | undefined,
  ) => Promise<SessionHandle | undefined>;
}): Promise<{ session: SessionHandle; messages: SessionHistoryMessages }> {
  const src = resolveSessionHandleFromDiskShared(
    opts.store,
    opts.srcSessionId,
    opts.inMemoryHandle,
  );
  const dest = await opts.createSession({
    workspace: src.workspace,
    mode: src.mode,
    modelRef: src.modelRef,
  });
  opts.store.cloneThroughMessage(opts.srcSessionId, dest.id, opts.throughMessageId);

  const base = src.title?.trim() || 'chat';
  const forkTitle = `Fork · ${base.length > 40 ? base.slice(0, 40) : base}`;
  const titled = await opts.setSessionTitle(dest.id, forkTitle);
  const handle = titled ?? opts.store.get(dest.id) ?? dest;

  const messages = uiMessagesFromEvents(opts.store.eventLog?.readEvents(dest.id) ?? []);
  refreshConversationFromUiMessagesShared({
    context: opts.context,
    toolResults: opts.toolResults,
    sessionId: dest.id,
    handle,
    messages,
    modeProfiles: opts.modeProfiles,
  });
  return { session: handle, messages };
}

export type SsePush = (envelope: SseEnvelope) => void;

/** 按 sessionId 取当前 turn 的 SSE push（C4d 扇出） */
export type GetSessionPush = (sessionId: string) => SsePush | undefined;

export function resolvePermissionShared(
  permissions: PermissionBroker,
  getPush: GetSessionPush,
  permissionId: string,
  decision: 'allow' | 'deny',
  options?: {
    remember?: boolean;
    shellAllowlist?: { add: (command: string) => boolean };
  },
): boolean {
  const pending = permissions.getPending(permissionId);
  const ok = permissions.resolve(permissionId, decision);
  if (ok && pending) {
    if (
      decision === 'allow' &&
      options?.remember &&
      options.shellAllowlist &&
      typeof pending.toolInput?.command === 'string'
    ) {
      options.shellAllowlist.add(pending.toolInput.command);
    }
    const push = getPush(pending.sessionId);
    push?.(
      makeEnvelope(
        'permission_resolved',
        {
          permissionId,
          decision,
          toolName: pending.toolName,
          toolCallId: pending.toolCallId,
          remembered: Boolean(
            decision === 'allow' && options?.remember && pending.toolInput?.command,
          ),
        },
        pending.sessionId,
      ),
    );
  }
  return ok;
}

export function resolveModeSuggestShared(
  broker: ModeSuggestBroker,
  suggestId: string,
  decision: 'switch' | 'skip',
): boolean {
  return broker.resolve(suggestId, decision);
}

export function resolvePlanQuestionShared(
  broker: PlanQuestionBroker,
  questionId: string,
  body: PlanQuestionResolveBody,
): boolean {
  if (body.skipped) return broker.resolve(questionId, { skipped: true });
  return broker.resolve(questionId, { answers: body.answers ?? [] });
}

export function listAuditShared(
  audit: AuditLog,
  opts?: { sessionId?: string; limit?: number },
) {
  return audit.list(opts);
}

export function availableToolsShared(
  config: HarnessConfig,
  filter: ToolFilter | undefined,
  description: (name: string) => string,
  modeProfiles: ModeProfileProvider,
): ToolDefinition[] {
  const mode = filter?.mode ?? config.mode;
  const names = filter?.allowed ?? toolsForMode(modeProfiles, mode);
  return names.map((name) => ({
    name,
    description: description(name),
    parameters: {},
  }));
}

/** SSE 异步队列：后台 push，前台 drain yield */
export function createSseEventQueue(): {
  push: (envelope: SseEnvelope) => void;
  wake: () => void;
  waitTick: () => Promise<void>;
  drain: () => SseEnvelope[];
  pendingCount: () => number;
} {
  const eventQueue: SseEnvelope[] = [];
  let resolveWait: (() => void) | null = null;
  const wake = () => {
    resolveWait?.();
  };
  return {
    push(envelope: SseEnvelope) {
      eventQueue.push(envelope);
      wake();
    },
    wake,
    async waitTick() {
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
        setTimeout(resolve, 50);
      });
      resolveWait = null;
    },
    drain() {
      const out: SseEnvelope[] = [];
      while (eventQueue.length > 0) {
        out.push(eventQueue.shift()!);
      }
      return out;
    },
    pendingCount() {
      return eventQueue.length;
    },
  };
}

/**
 * C4d-S3：turn 级扇出缓冲。HTTP 断连只停 subscribe，不中断后台 turn；
 * attach 可从 fromIndex 重放后再接 live。
 */
export function createTurnHub(): {
  push: (envelope: SseEnvelope) => void;
  subscribe: (fromIndex?: number) => AsyncGenerator<SseEnvelope, void, unknown>;
  finish: () => void;
  size: () => number;
} {
  const buffer: SseEnvelope[] = [];
  let finished = false;
  const waiters = new Set<() => void>();
  const wake = () => {
    for (const w of waiters) w();
    waiters.clear();
  };
  return {
    push(envelope) {
      // seq = 入缓冲前 length，与 subscribe(fromIndex) 对齐（0,1,2…）
      buffer.push({ ...envelope, seq: buffer.length });
      wake();
    },
    finish() {
      finished = true;
      wake();
    },
    size: () => buffer.length,
    async *subscribe(fromIndex = 0) {
      let i = Math.max(0, fromIndex);
      while (true) {
        while (i < buffer.length) {
          yield buffer[i++]!;
        }
        if (finished) return;
        await new Promise<void>((resolve) => {
          waiters.add(resolve);
          setTimeout(resolve, 50);
        });
      }
    },
  };
}

/** O3：workspace 级 session busy/idle 控制面（live-only，不重放历史） */
export function createSessionActivityHub(): {
  notifyBusy: (sessionId: string) => void;
  notifyIdle: (sessionId: string) => void;
  subscribe: () => AsyncGenerator<SseEnvelope, void, unknown>;
} {
  const listeners = new Set<(envelope: SseEnvelope) => void>();

  function emit(type: 'session_busy' | 'session_idle', sessionId: string): void {
    const envelope: SseEnvelope = {
      type,
      ts: Date.now(),
      conversationId: sessionId,
      payload: { sessionId },
    };
    for (const listener of listeners) listener(envelope);
  }

  return {
    notifyBusy(sessionId) {
      emit('session_busy', sessionId);
    },
    notifyIdle(sessionId) {
      emit('session_idle', sessionId);
    },
    async *subscribe() {
      const queue: SseEnvelope[] = [];
      let wake: (() => void) | null = null;
      const listener = (envelope: SseEnvelope) => {
        queue.push(envelope);
        wake?.();
      };
      listeners.add(listener);
      try {
        while (true) {
          while (queue.length) {
            yield queue.shift()!;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            // 空闲时周期性醒来，便于 SSE 层写注释保活
            setTimeout(resolve, 15_000);
          });
          wake = null;
        }
      } finally {
        listeners.delete(listener);
      }
    },
  };
}

export type SessionActivityHub = ReturnType<typeof createSessionActivityHub>;

export function clearActiveTurnShared(opts: {
  sessionId: string;
  busySessions: Set<string>;
  turnHubs: Map<string, { hub: { finish: () => void } }>;
  activePushes: Map<string, SsePush>;
  activeTurnMessageIds: Map<string, string>;
  sessionActivity: SessionActivityHub;
  /** 有待投递后台 Task 时跳过 idle，避免 UI 队列抢在摘要投递前出队 */
  skipIdleNotify?: boolean;
}): void {
  const { sessionId } = opts;
  const wasBusy = opts.busySessions.has(sessionId);
  const turn = opts.turnHubs.get(sessionId);
  turn?.hub.finish();
  opts.turnHubs.delete(sessionId);
  opts.activePushes.delete(sessionId);
  opts.activeTurnMessageIds.delete(sessionId);
  opts.busySessions.delete(sessionId);
  if (wasBusy && !opts.skipIdleNotify) opts.sessionActivity.notifyIdle(sessionId);
}

/**
 * 安装模式建议推送路由：broker.requestApproval 时向当前 turn SSE 推送 mode_suggested。
 */
export function installModeSuggestPushRouter(
  broker: ModeSuggestBroker,
  getTurn: (sessionId: string) => { push: SsePush; messageId: string } | undefined,
): void {
  broker.setRequestHandler((req) => {
    const turn = getTurn(req.sessionId);
    if (!turn) return;
    turn.push(
      makeEnvelope(
        'mode_suggested',
        {
          suggestId: req.id,
          suggestedMode: req.suggestedMode,
          currentMode: req.currentMode,
          reason: req.reason,
        },
        req.sessionId,
        turn.messageId,
      ),
    );
  });
}

export function installPlanQuestionPushRouter(
  broker: PlanQuestionBroker,
  getTurn: (sessionId: string) => { push: SsePush; messageId: string } | undefined,
): void {
  broker.setRequestHandler((req) => {
    const turn = getTurn(req.sessionId);
    if (!turn) return;
    turn.push(
      makeEnvelope(
        'plan_question',
        { questionId: req.id, questions: req.questions },
        req.sessionId,
        turn.messageId,
      ),
    );
  });
}

export function assembleAndPushInjections(opts: {
  push: (envelope: SseEnvelope) => void;
  memory: MemoryStore;
  skills: SkillRegistry;
  rules: RuleRegistry;
  maxInjectTokens: number;
  userMessage: string;
  sessionId: string;
  messageId: string;
  /** 会话已启用 MCP server id；供 Skill requiresMcp 门禁 */
  enabledMcpIds?: ReadonlySet<string>;
}): {
  mem: ReturnType<typeof assembleMemoryInjection>;
  rulesAdv: ReturnType<typeof assembleRulesInjection>;
  skillAdv: ReturnType<typeof assembleSkillInjection>;
} {
  const rulesAdv = assembleRulesInjection(opts.rules, opts.userMessage);
  if (rulesAdv.included.length > 0) {
    opts.push(
      makeEnvelope(
        'rules_injected',
        {
          names: rulesAdv.included.map((r) => r.name),
          paths: rulesAdv.paths,
          tokenEstimate: rulesAdv.tokenEstimate,
          truncated: rulesAdv.truncated,
        },
        opts.sessionId,
        opts.messageId,
      ),
    );
  }

  const mem = assembleMemoryInjection(opts.memory, opts.userMessage);
  if (mem.paths.length > 0) {
    opts.push(
      makeEnvelope(
        'memory_injected',
        { paths: mem.paths, tokenEstimate: mem.tokenEstimate },
        opts.sessionId,
        opts.messageId,
      ),
    );
  }

  const skillAdv = assembleSkillInjection(opts.skills, opts.userMessage, {
    maxInjectTokens: opts.maxInjectTokens,
    enabledMcpIds: opts.enabledMcpIds,
  });
  if (skillAdv.activated.length > 0) {
    for (const s of skillAdv.activated) {
      console.info(
        `[ciro:skill] skill_activated name=${s.name} source=${s.source} path=${relative(process.cwd(), s.path)} budget=${opts.maxInjectTokens}`,
      );
    }
    opts.push(
      makeEnvelope(
        'skill_activated',
        {
          names: skillAdv.activated.map((s) => s.name),
          paths: skillAdv.paths,
          tokenEstimate: skillAdv.tokenEstimate,
          truncated: skillAdv.truncated,
        },
        opts.sessionId,
        opts.messageId,
      ),
    );
  }

  return { mem, rulesAdv, skillAdv };
}

/**
 * 安装稳定 permission router：按 req.sessionId 查当前 turn 的 push/messageId。
 * 只应调用一次（构造时）；turn 启停只改 getTurn 背后的 Map，禁止每轮 setRequestHandler(null)。
 */
export function installPermissionPushRouter(
  permissions: PermissionBroker,
  getTurn: (sessionId: string) => { push: SsePush; messageId: string } | undefined,
): void {
  permissions.setRequestHandler((req) => {
    const turn = getTurn(req.sessionId);
    if (!turn) return;
    turn.push(
      makeEnvelope(
        'permission_request',
        {
          permissionId: req.id,
          toolName: req.toolName,
          toolInput: req.toolInput,
          reason: req.reason,
          sessionId: req.sessionId,
          toolCallId: req.toolCallId,
        },
        req.sessionId,
        turn.messageId,
      ),
    );
  });
}

export async function emitAutoCompaction(opts: {
  push: (envelope: SseEnvelope) => void;
  compaction: CompactionOrchestrator;
  context: ContextAccountant;
  sessionId: string;
  messageId: string;
  fallbackSnapshot: ContextUsageSnapshot;
  compactSession: (
    sessionId: string,
    compactOpts?: CompactSessionOptions,
  ) => Promise<{ result: CompactionResult; contextUsage?: ContextUsageSnapshot }>;
}): Promise<void> {
  const decision = opts.compaction.decideAutoAction(opts.sessionId);
  if (decision.action === 'suggest') {
    const snap = opts.context.get(opts.sessionId) ?? opts.fallbackSnapshot;
    opts.push(
      makeEnvelope(
        'compaction_suggested',
        {
          urgency: decision.urgency,
          usageRatio: snap.usageRatio,
          recommended:
            decision.urgency === 'background'
              ? 'micro'
              : decision.urgency === 'required'
                ? 'full'
                : 'session-memory',
        },
        opts.sessionId,
        opts.messageId,
      ),
    );
  } else if (
    decision.action === 'micro' ||
    decision.action === 'session-memory' ||
    decision.action === 'full'
  ) {
    opts.push(
      makeEnvelope(
        'compaction_progress',
        { method: decision.action, stage: 'start' },
        opts.sessionId,
        opts.messageId,
      ),
    );
    const { result, contextUsage } = await opts.compactSession(opts.sessionId, {
      method: decision.action,
    });
    opts.push(
      makeEnvelope(
        'compaction_completed',
        { result, contextUsage },
        opts.sessionId,
        opts.messageId,
      ),
    );
    if (contextUsage) {
      opts.push(makeEnvelope('context_usage', contextUsage, opts.sessionId, opts.messageId));
    }
  }
}
