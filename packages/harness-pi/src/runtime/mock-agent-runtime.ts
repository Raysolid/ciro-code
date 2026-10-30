import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type HarnessConfig,
  type HarnessMode,
  type ModeProfileProvider,
  type ModelRef,
  type PlanRecord,
  type PlanSummary,
  type DebugSessionInfo,
  type FileChangeRecord,
  type SessionCreateOptions,
  type SessionHandle,
  type SseEnvelope,
  type ThinkingLevel,
  type ToolDefinition,
  type ToolFilter,
  type TurnContext,
  type UserMessage,
  type CompactionResult,
  type ContextUsageSnapshot,
  type SubagentStopReason,
  type SubagentType,
  type SummarySchemaV1,
  createMinimalModeProfiles,
  resolveEffectiveContextLimit,
  toMenuThinkingLevel,
  debugHitlUnlockFromUserText,
} from '@ciro-code/harness-shared';
import {
  AuditLog,
  CompactionOrchestrator,
  ContextAccountant,
  MemoryStore,
  PermissionBroker,
  ShellAllowlistStore,
  PlanStore,
  PolicyEngine,
  SessionStore,
  SkillRegistry,
  RuleRegistry,
  McpManager,
  assertWritable,
  buildUnifiedDiff,
  countDebugLogLines,
  createSessionPolicyGate,
  defaultSessionsRoot,
  isPolicyBlocked,
  policyBlockMessage,
  runSandboxed,
  startDebugIngestServer,
  stoppedDebugInfoFromPointer,
  SubagentOrchestrator,
  listSubagentMetas,
  readSubagentEvents,
  type TaskExploreResult,
  type AgentRuntime,
  type CompactSessionOptions,
  type CreateRuntimeOptions,
  type DebugIngestHandle,
  type ProviderStore,
  type SubagentRunView,
  type ToolPolicyGate,
  type ToolResultRecord,
  uiMessagesFromEvents,
  validateChatImages,
  persistChatImages,
  ChatImageValidationError,
  createStubFullCompactSummarizer,
  sumToolPayloadTokens,
} from '@ciro-code/harness-core';
import type { SubagentRunMeta } from '@ciro-code/harness-shared';
import { createMockExploreRunner } from '../subagent/mock-explore-runner.js';
import { createWebFetchTool } from '../tools/web-fetch-tool.js';
import { makeEnvelope } from '../sse/envelope.js';
import {
  assembleAndPushInjections,
  availableToolsShared,
  clearActiveTurnShared,
  compactSessionShared,
  confirmPlanShared,
  createSessionActivityHub,
  createTurnHub,
  emitAutoCompaction,
  forkChatSessionShared,
  getPlanShared,
  installPermissionPushRouter,
  listAuditShared,
  acceptFileChangeShared,
  listFileChangesShared,
  latestConfirmedPlan,
  listPlansShared,
  recordFileChangeReviewShared,
  rejectFileChangeShared,
  rebindWorkspaceShared,
  recoverSessionShared,
  resolvePermissionShared,
  resolveSessionDir,
  savePlanToWorkspaceShared,
  toolsForMode,
  trackToolResultShared,
  truncateSessionHistoryShared,
  type SessionActivityHub,
  type SsePush,
} from './runtime-shared.js';

export class MockAgentRuntime implements AgentRuntime {
  private readonly store: SessionStore;
  private readonly policy = new PolicyEngine();
  private readonly permissions: PermissionBroker;
  private readonly shellAllowlist: ShellAllowlistStore;
  private readonly audit: AuditLog;
  private memory: MemoryStore;
  private skills: SkillRegistry;
  private rules: RuleRegistry;
  private mcp: McpManager;
  private readonly context: ContextAccountant;
  private readonly compaction: CompactionOrchestrator;
  private readonly providerStore?: ProviderStore;
  private readonly modeProfiles: ModeProfileProvider;
  private readonly toolResults = new Map<string, ToolResultRecord[]>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly config: HarnessConfig;
  private readonly planStore: PlanStore;
  private readonly debugSessions = new Map<
    string,
    {
      info: DebugSessionInfo;
      handle: DebugIngestHandle | null;
      analyzeUnlocked?: boolean;
      cleanupUnlocked?: boolean;
    }
  >();
  /** C4d：按 sessionId 扇出 SSE */
  private readonly activePushes = new Map<string, SsePush>();
  private readonly activeTurnMessageIds = new Map<string, string>();
  private readonly turnHubs = new Map<
    string,
    {
      hub: ReturnType<typeof createTurnHub>;
      assistantMessageId: string;
      userMessageId: string;
    }
  >();
  private readonly consecutiveToolFailures = new Map<string, number>();
  private readonly busySessions = new Set<string>();
  private readonly sessionActivity: SessionActivityHub;
  private readonly subagents: SubagentOrchestrator;
  private readonly pendingBackgroundResults = new Map<
    string,
    Array<{
      taskId: string;
      subagentType: SubagentType;
      status: 'completed' | 'failed' | 'stopped';
      summary?: SummarySchemaV1;
      error?: string;
      reason?: SubagentStopReason;
    }>
  >();
  private readonly turnBackgroundTasks = new Map<string, Set<string>>();

  constructor(config: HarnessConfig, options: CreateRuntimeOptions = {}) {
    this.config = config;
    this.modeProfiles = options.modeProfiles ?? createMinimalModeProfiles();
    this.sessionActivity =
      (options.sessionActivity as SessionActivityHub | undefined) ??
      createSessionActivityHub();
    this.store =
      options.sessionStore ??
      new SessionStore({ snapshotInterval: config.session.snapshotInterval });
    this.planStore = new PlanStore({
      sessionsRoot: this.store.eventLog?.sessionsRoot ?? defaultSessionsRoot(),
    });
    this.subagents = new SubagentOrchestrator({
      config: config.subagents,
      resolveSessionDir: (id) => {
        try {
          return resolveSessionDir(this.store, this.config.workspace, id);
        } catch {
          return null;
        }
      },
      exploreRunner: createMockExploreRunner(),
    });
    this.audit = options.auditLog ?? new AuditLog();
    this.permissions = options.permissionBroker ?? new PermissionBroker();
    this.shellAllowlist = options.shellAllowlist ?? new ShellAllowlistStore();
    this.memory =
      options.memoryStore ?? new MemoryStore(config.workspace);
    this.skills =
      options.skillRegistry ??
      new SkillRegistry({
        workspace: config.workspace,
        maxInjectTokens: config.skill.maxInjectTokens,
      });
    this.rules = new RuleRegistry({ workspace: config.workspace });
    this.mcp = options.mcpManager ?? new McpManager({ workspace: config.workspace });
    this.context =
      options.contextAccountant ??
      new ContextAccountant({
        modelContextLimit: config.modelContextLimit,
        reservedOutputTokens: config.reservedOutputTokens,
        compaction: config.compaction,
      });
    this.compaction = new CompactionOrchestrator(
      config.compaction,
      this.context,
      createStubFullCompactSummarizer(),
    );
    this.providerStore = options.providerStore;
    installPermissionPushRouter(this.permissions, (sessionId) => {
      const push = this.activePushes.get(sessionId);
      const messageId = this.activeTurnMessageIds.get(sessionId);
      if (!push || messageId == null) return undefined;
      return { push, messageId };
    });
  }

  private clearActiveTurn(sessionId: string): void {
    this.turnBackgroundTasks.delete(sessionId);
    clearActiveTurnShared({
      sessionId,
      busySessions: this.busySessions,
      turnHubs: this.turnHubs,
      activePushes: this.activePushes,
      activeTurnMessageIds: this.activeTurnMessageIds,
      sessionActivity: this.sessionActivity,
    });
  }

  private noteBackgroundTaskStarted(sessionId: string, taskId: string): void {
    if (!taskId) return;
    let set = this.turnBackgroundTasks.get(sessionId);
    if (!set) {
      set = new Set();
      this.turnBackgroundTasks.set(sessionId, set);
    }
    set.add(taskId);
  }

  private enqueueBackgroundResult(sessionId: string, result: TaskExploreResult): void {
    if (result.status === 'running' || !result.taskId) return;
    this.turnBackgroundTasks.get(sessionId)?.delete(result.taskId);
    if (result.reason === 'parent_abort' || result.reason === 'parent_deleted') return;
    const kind = result.subagentType ?? 'explore';
    const status =
      result.status === 'completed' || result.status === 'failed' || result.status === 'stopped'
        ? result.status
        : 'failed';
    const q = this.pendingBackgroundResults.get(sessionId) ?? [];
    q.push({
      taskId: result.taskId,
      subagentType: kind,
      status,
      summary: result.summary,
      error: result.error,
      reason: result.reason,
    });
    this.pendingBackgroundResults.set(sessionId, q);
  }

  /** 同轮等待后台 Task 并吐出汇总 token（无用户气泡） */
  private async finishBackgroundTasksInTurn(
    sessionId: string,
    push: (envelope: SseEnvelope) => void,
    messageId: string,
  ): Promise<void> {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const deadline = Date.now() + 30_000;
    while (this.busySessions.has(sessionId) && Date.now() < deadline) {
      const hasAwaiting = (this.turnBackgroundTasks.get(sessionId)?.size ?? 0) > 0;
      const hasPending = (this.pendingBackgroundResults.get(sessionId)?.length ?? 0) > 0;
      if (!hasAwaiting && !hasPending) return;
      while (
        this.busySessions.has(sessionId) &&
        (this.turnBackgroundTasks.get(sessionId)?.size ?? 0) > 0 &&
        Date.now() < deadline
      ) {
        await sleep(40);
      }
      const q = this.pendingBackgroundResults.get(sessionId);
      if (!q?.length) {
        if ((this.turnBackgroundTasks.get(sessionId)?.size ?? 0) === 0) return;
        continue;
      }
      const item = q.shift()!;
      if (q.length === 0) this.pendingBackgroundResults.delete(sessionId);
      else this.pendingBackgroundResults.set(sessionId, q);
      const textChunk = item.summary
        ? JSON.stringify(item.summary)
        : item.error ?? item.status;
      this.context.appendSubagents(sessionId, `${textChunk}\n`);
      const conclusion = item.summary?.conclusion ?? item.error ?? item.status;
      push(
        makeEnvelope(
          'token',
          {
            delta: `\n\nBackground Task (${item.subagentType}) finished: ${conclusion}`,
          },
          sessionId,
          messageId,
        ),
      );
    }
  }

  getContextUsage(sessionId: string) {
    return this.context.get(sessionId);
  }

  rebindWorkspace(
    workspace: string,
    opts?: { memoryStore?: MemoryStore; mcpManager?: McpManager; skillRegistry?: SkillRegistry },
  ): void {
    const rebound = rebindWorkspaceShared(this.config, workspace, opts);
    this.memory = rebound.memory;
    this.skills = rebound.skills;
    this.rules = rebound.rules;
    if (opts?.mcpManager) {
      this.mcp = opts.mcpManager;
    } else {
      this.mcp?.rebindWorkspace(workspace);
    }
  }

  private sessionDir(sessionId: string): string {
    return resolveSessionDir(this.store, this.config.workspace, sessionId);
  }

  private trackToolResult(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    content: string,
  ): void {
    trackToolResultShared(
      this.toolResults,
      this.sessionDir(sessionId),
      sessionId,
      toolCallId,
      toolName,
      content,
    );
  }

  /** 落盘 tool_call + tool_result，供 resume 重建时间线 */
  private persistToolTurn(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    opts?: {
      toolInput?: Record<string, unknown>;
      resultPreview?: string;
      isError?: boolean;
    },
  ): void {
    this.store.appendEvent(sessionId, {
      type: 'tool_call',
      toolCallId,
      toolName,
      toolInput: opts?.toolInput,
    });
    this.store.appendEvent(sessionId, {
      type: 'tool_result',
      toolCallId,
      toolName,
      isError: opts?.isError ?? false,
      content: opts?.resultPreview,
    });
  }

  async compactSession(
    sessionId: string,
    opts?: CompactSessionOptions,
  ): Promise<{ result: CompactionResult; contextUsage?: ContextUsageSnapshot }> {
    if (this.busySessions.has(sessionId) && !opts?.allowBusy) {
      throw new Error('SESSION_BUSY: Session is streaming');
    }
    const shared = await compactSessionShared({
      store: this.store,
      context: this.context,
      compaction: this.compaction,
      toolResults: this.toolResults,
      sessionDir: this.sessionDir(sessionId),
      sessionId,
      modeProfiles: this.modeProfiles,
      compactOpts: opts,
    });
    const handle = this.store.get(sessionId);
    if (!handle) return { result: shared.result, contextUsage: shared.contextUsage };
    const seedConversation = shared.seedMessages
      .map((m) => (m.role === 'user' ? `\nUser: ${m.content}` : `\nAssistant: ${m.content}`))
      .join('');
    const contextUsage = this.context.refresh(sessionId, {
      system: this.modeProfiles.systemPromptForMode(handle.mode),
      tools: toolsForMode(this.modeProfiles, handle.mode).join('\n'),
      conversation: seedConversation,
      summarized: '',
      toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(sessionId) ?? []),
    });
    return { result: shared.result, contextUsage };
  }

  async resumeSession(sessionId: string): Promise<{
    session: SessionHandle;
    messageCount: number;
    eventsReplayed: number;
    stoppedAtBoundary: boolean;
    contextUsage?: ContextUsageSnapshot;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
    confirmedPlanId?: string;
  }> {
    const state = recoverSessionShared(
      this.store,
      this.context,
      this.toolResults,
      sessionId,
      this.modeProfiles,
    );
    this.hydrateDebugFromMeta(sessionId);
    if (state.handle.mode === 'debug') {
      await this.startDebug(state.handle);
    }
    const confirmedPlanId = latestConfirmedPlan(this.planStore, sessionId)?.planId;
    return {
      session: state.handle,
      messageCount: state.messageCount,
      eventsReplayed: state.eventsReplayed,
      stoppedAtBoundary: state.stoppedAtBoundary,
      contextUsage: state.contextUsage,
      messages: state.messages,
      ...(confirmedPlanId ? { confirmedPlanId } : {}),
    };
  }

  async createSession(opts: SessionCreateOptions): Promise<SessionHandle> {
    const handle = this.store.create({
      ...opts,
      mode: opts.mode ?? this.config.mode,
    });
    this.context.refresh(handle.id, {
      system: this.modeProfiles.systemPromptForMode(handle.mode),
      tools: toolsForMode(this.modeProfiles, handle.mode).join('\n'),
      conversation: '',
    });
    if (handle.mode === 'debug') {
      await this.startDebug(handle);
    }
    return handle;
  }

  getSession(sessionId: string): SessionHandle | undefined {
    return this.store.get(sessionId);
  }

  async setMode(sessionId: string, mode: HarnessMode): Promise<SessionHandle | undefined> {
    const prev = this.store.get(sessionId);
    const updated = this.store.updateMode(sessionId, mode);
    if (updated && prev?.mode !== mode) {
      if (prev?.mode === 'debug' && mode !== 'debug') {
        await this.stopDebug(sessionId);
      }
      if (mode === 'debug') {
        await this.startDebug(updated);
      }
    }
    return updated;
  }

  async setModelRef(
    sessionId: string,
    modelRef: ModelRef | undefined,
  ): Promise<SessionHandle | undefined> {
    const updated = this.store.updateModelRef(sessionId, modelRef);
    if (updated) this.syncSessionContextLimit(updated);
    return updated;
  }

  async setThinkingLevel(
    sessionId: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<SessionHandle | undefined> {
    return this.store.updateThinkingLevel(sessionId, toMenuThinkingLevel(thinkingLevel));
  }

  async setMaxMode(sessionId: string, maxMode: boolean): Promise<SessionHandle | undefined> {
    const updated = this.store.updateMaxMode(sessionId, maxMode);
    if (updated) this.syncSessionContextLimit(updated);
    return updated;
  }

  private syncSessionContextLimit(handle: SessionHandle): void {
    const creds =
      handle.modelRef && this.providerStore
        ? this.providerStore.resolveCredentials(handle.modelRef)
        : null;
    const limit = resolveEffectiveContextLimit({
      maxMode: handle.maxMode,
      apiMaxContext: creds?.model.apiMaxContext,
      contextLimit: creds?.model.contextLimit,
      modelId: handle.modelRef?.modelId ?? creds?.model.id,
      fallbackLimit: this.config.modelContextLimit,
    });
    this.context.setSessionLimit(handle.id, limit);
    this.context.refresh(handle.id, {
      conversation: this.context.getConversation(handle.id),
      summarized: this.context.getSummarized(handle.id),
      toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(handle.id) ?? []),
    });
  }

  listPlans(sessionId: string): PlanSummary[] {
    return listPlansShared(this.planStore, sessionId);
  }

  listFileChanges(sessionId: string): FileChangeRecord[] {
    return listFileChangesShared(this.store, sessionId);
  }

  acceptFileChange(sessionId: string, path: string): FileChangeRecord {
    const record = acceptFileChangeShared(this.store, sessionId, path);
    if (!record) {
      throw new Error(`Change not found after accept: ${path}`);
    }
    return record;
  }

  rejectFileChange(sessionId: string, path: string): FileChangeRecord {
    const record = rejectFileChangeShared(this.store, sessionId, path);
    if (!record) {
      throw new Error(`Change not found after reject: ${path}`);
    }
    return record;
  }

  getPlan(sessionId: string, planId: string): PlanRecord | undefined {
    return getPlanShared(this.planStore, sessionId, planId);
  }

  async confirmPlan(
    sessionId: string,
    planId: string,
  ): Promise<{ session: SessionHandle; plan: PlanRecord }> {
    if (this.isSessionBusy(sessionId)) {
      await this.abort(sessionId);
    }
    return confirmPlanShared(
      this.store,
      this.planStore,
      sessionId,
      planId,
      (id, mode) => this.setMode(id, mode),
    );
  }

  async savePlanToWorkspace(
    sessionId: string,
    planId: string,
  ): Promise<{ pathRel: string; plan: PlanRecord }> {
    return savePlanToWorkspaceShared(this.store, this.planStore, sessionId, planId);
  }

  getDebugSession(sessionId: string): DebugSessionInfo | undefined {
    const existing = this.debugSessions.get(sessionId)?.info;
    if (existing) return existing;
    this.hydrateDebugFromMeta(sessionId);
    return this.debugSessions.get(sessionId)?.info;
  }

  async proceedDebug(sessionId: string): Promise<DebugSessionInfo> {
    const state = this.debugSessions.get(sessionId);
    if (!state?.handle) throw new Error('No active debug session');
    const lineCount = countDebugLogLines(state.handle.logPath);
    state.info = { ...state.info, status: 'logs_ready', ingestRunning: true };
    void lineCount;
    return state.info;
  }

  async markDebugFixed(sessionId: string): Promise<DebugSessionInfo> {
    const state = this.debugSessions.get(sessionId);
    if (!state?.handle) throw new Error('No active debug session');
    state.info = { ...state.info, ingestRunning: true };
    return state.info;
  }

  private hydrateDebugFromMeta(sessionId: string): void {
    if (this.debugSessions.has(sessionId)) return;
    const meta = this.store.eventLog?.readMeta(sessionId);
    const ptr = this.store.eventLog?.lastDebugPointer(sessionId);
    if (!ptr?.debugSessionId || !ptr.logPathRel) return;
    const workspace = this.store.get(sessionId)?.workspace ?? meta?.workspace;
    if (!workspace) return;
    this.debugSessions.set(sessionId, {
      handle: null,
      info: stoppedDebugInfoFromPointer(workspace, ptr),
    });
  }

  private reuseDebugSessionId(sessionId: string): string | undefined {
    const live = this.debugSessions.get(sessionId)?.info.debugSessionId;
    if (live) return live;
    return this.store.eventLog?.lastDebugPointer(sessionId)?.debugSessionId || undefined;
  }

  private async startDebug(handle: SessionHandle): Promise<void> {
    const reuseId = this.reuseDebugSessionId(handle.id);
    const live = this.debugSessions.get(handle.id);
    if (live?.handle && live.info.ingestRunning && (!reuseId || live.info.debugSessionId === reuseId)) {
      return;
    }
    await this.stopDebug(handle.id);
    const ingest = await startDebugIngestServer({
      workspace: handle.workspace,
      sessionShortId: reuseId,
    });
    this.debugSessions.set(handle.id, {
      handle: ingest,
      info: {
        debugSessionId: ingest.debugSessionId,
        ingestUrl: ingest.ingestUrl,
        logPath: ingest.logPath,
        logPathRel: ingest.logPathRel,
        status: 'ready',
        ingestRunning: true,
      },
    });
    if (!reuseId) {
      this.store.appendEvent(handle.id, {
        type: 'mode_change',
        mode: 'debug',
        debugSessionId: ingest.debugSessionId,
        logPathRel: ingest.logPathRel,
      });
    }
  }

  private async stopDebug(sessionId: string): Promise<void> {
    const state = this.debugSessions.get(sessionId);
    if (!state) return;
    if (state.handle) {
      try {
        await state.handle.close();
      } catch {
        /* ignore */
      }
    }
    this.debugSessions.set(sessionId, {
      handle: null,
      info: { ...state.info, status: 'stopped', ingestRunning: false },
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.permissions.rejectAll(sessionId);
    await this.stopDebug(sessionId);
    this.debugSessions.delete(sessionId);
    try {
      this.subagents.disposeParent(sessionId, this.sessionDir(sessionId));
    } catch {
      this.subagents.abortAllForParent(sessionId, 'parent_deleted');
    }
    this.abortControllers.get(sessionId)?.abort();
    this.abortControllers.delete(sessionId);
    this.context.clear(sessionId);
    this.clearActiveTurn(sessionId);
    return this.store.delete(sessionId);
  }

  isSessionBusy(sessionId: string): boolean {
    return this.busySessions.has(sessionId);
  }

  async *attachMessage(
    sessionId: string,
    opts?: { fromSeq?: number },
  ): AsyncIterable<SseEnvelope> {
    const turn = this.turnHubs.get(sessionId);
    if (!turn || !this.busySessions.has(sessionId)) {
      throw new Error('SESSION_IDLE: Session is not streaming');
    }
    const handle = this.store.get(sessionId);
    if (!handle) {
      throw new Error('SESSION_NOT_FOUND: Session not found');
    }
    const fromSeq =
      typeof opts?.fromSeq === 'number' && Number.isFinite(opts.fromSeq)
        ? Math.max(0, Math.floor(opts.fromSeq))
        : 0;
    if (fromSeq === 0) {
      const events = this.store.eventLog?.readEvents(sessionId) ?? [];
      const messages = uiMessagesFromEvents(events).filter(
        (m) => m.id !== turn.assistantMessageId,
      );
      yield makeEnvelope(
        'attach_snapshot',
        {
          session: handle,
          messages,
          assistantMessageId: turn.assistantMessageId,
          contextUsage: this.context.get(sessionId),
        },
        sessionId,
        turn.userMessageId,
      );
    }
    yield* turn.hub.subscribe(fromSeq);
  }

  subscribeSessionActivity(): AsyncIterable<SseEnvelope> {
    return this.sessionActivity.subscribe();
  }

  async setSessionTitle(
    sessionId: string,
    title: string | undefined,
  ): Promise<SessionHandle | undefined> {
    return this.store.updateTitle(sessionId, title);
  }

  async rewindSession(
    sessionId: string,
    beforeMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    return truncateSessionHistoryShared({
      store: this.store,
      context: this.context,
      toolResults: this.toolResults,
      busySessions: this.busySessions,
      sessionId,
      messageId: beforeMessageId,
      kind: 'rewind',
      modeProfiles: this.modeProfiles,
    });
  }

  async prepareFork(
    sessionId: string,
    fromMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    return truncateSessionHistoryShared({
      store: this.store,
      context: this.context,
      toolResults: this.toolResults,
      busySessions: this.busySessions,
      sessionId,
      messageId: fromMessageId,
      kind: 'fork',
      modeProfiles: this.modeProfiles,
    });
  }

  async forkChatSession(
    srcSessionId: string,
    throughMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    return forkChatSessionShared({
      store: this.store,
      context: this.context,
      toolResults: this.toolResults,
      srcSessionId,
      throughMessageId,
      modeProfiles: this.modeProfiles,
      createSession: (options) => this.createSession(options),
      setSessionTitle: (sessionId, title) => this.setSessionTitle(sessionId, title),
    });
  }

  async resolvePermission(
    permissionId: string,
    decision: 'allow' | 'deny',
    options?: { remember?: boolean },
  ): Promise<boolean> {
    return resolvePermissionShared(
      this.permissions,
      (sid) => this.activePushes.get(sid),
      permissionId,
      decision,
      { remember: options?.remember, shellAllowlist: this.shellAllowlist },
    );
  }

  async resolveModeSuggest(_suggestId: string, _decision: 'switch' | 'skip'): Promise<boolean> {
    return false;
  }

  async resolvePlanQuestion(
    _questionId: string,
    _body: import('@ciro-code/harness-shared').PlanQuestionResolveBody,
  ): Promise<boolean> {
    return false;
  }

  listAudit(opts?: { sessionId?: string; limit?: number }) {
    return listAuditShared(this.audit, opts);
  }

  private gateFor(ctx: TurnContext): ToolPolicyGate {
    return createSessionPolicyGate({
      policy: this.policy,
      audit: this.audit,
      permissions: this.permissions,
      shellAllowlist: this.shellAllowlist,
      getMcpReadOnlyHint: (n) => this.mcp.getReadOnlyHint(n),
      getCtx: () => {
        const dbg = this.debugSessions.get(ctx.sessionId);
        return {
          mode: ctx.mode,
          workspace: ctx.workspace,
          sessionId: ctx.sessionId,
          preset:
            this.config.permissions?.preset ??
            this.modeProfiles.getModeProfile(ctx.mode).permissionPreset,
          debugLogPath: dbg?.handle?.logPath ?? dbg?.info.logPath,
          debugLogPathRel: dbg?.info.logPathRel,
          debugAnalyzeUnlocked: Boolean(dbg?.analyzeUnlocked),
          debugCleanupUnlocked: Boolean(dbg?.cleanupUnlocked),
        };
      },
    });
  }

  async *sendMessage(
    sessionId: string,
    message: UserMessage,
    ctx: TurnContext,
  ): AsyncIterable<SseEnvelope> {
    const session = this.store.get(sessionId);
    if (!session) {
      yield makeEnvelope('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' }, sessionId);
      return;
    }

    if (this.busySessions.has(sessionId)) {
      throw new Error('SESSION_BUSY: Session is streaming');
    }

    if (ctx.mode === 'debug') {
      const dbg = this.debugSessions.get(sessionId);
      if (dbg) {
        const hitl = debugHitlUnlockFromUserText(message.message);
        if (hitl.analyzeUnlocked) dbg.analyzeUnlocked = true;
        if (hitl.cleanupUnlocked) dbg.cleanupUnlocked = true;
      }
    }

    const userMessageId =
      typeof message.messageId === 'string' && message.messageId.trim()
        ? message.messageId.trim()
        : randomUUID();

    let imageRefs: ReturnType<typeof persistChatImages> = [];
    try {
      const validatedImages = validateChatImages(message.images);
      if (validatedImages.length > 0) {
        imageRefs = persistChatImages(
          this.sessionDir(sessionId),
          userMessageId,
          validatedImages,
        );
      }
    } catch (err) {
      const msg =
        err instanceof ChatImageValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      yield makeEnvelope('error', { message: msg, code: 'INVALID_IMAGES' }, sessionId);
      return;
    }

    const abort = new AbortController();
    this.abortControllers.set(sessionId, abort);
    const assistantMessageId = randomUUID();
    const messageId = userMessageId;
    const hub = createTurnHub();
    let assistantText = '';
    let assistantFlushedLen = 0;
    let thinkingText = '';
    let thinkingStartedAt: number | null = null;
    const turnStartedAt = Date.now();
    const flushThinkingSegment = () => {
      if (!thinkingText) return;
      const durationSec =
        thinkingStartedAt != null
          ? Math.max(1, Math.round((Date.now() - thinkingStartedAt) / 1000))
          : undefined;
      this.store.appendEvent(sessionId, {
        type: 'thinking',
        messageId: assistantMessageId,
        content: thinkingText,
        durationSec,
      });
      thinkingText = '';
      thinkingStartedAt = null;
    };
    const flushAssistantSegment = () => {
      const segment = assistantText.slice(assistantFlushedLen);
      if (!segment) return;
      assistantFlushedLen = assistantText.length;
      this.store.appendEvent(sessionId, {
        type: 'message',
        role: 'assistant',
        messageId: assistantMessageId,
        content: segment,
      });
    };
    const push: typeof hub.push = (envelope) => {
      if (envelope.type === 'thinking') {
        const delta = (envelope.payload as { delta?: string }).delta ?? '';
        if (thinkingStartedAt == null) thinkingStartedAt = Date.now();
        thinkingText += delta;
      } else if (envelope.type === 'token') {
        flushThinkingSegment();
        const delta = (envelope.payload as { delta?: string }).delta ?? '';
        assistantText += delta;
      } else if (envelope.type === 'tool_call_start') {
        flushThinkingSegment();
        flushAssistantSegment();
      }
      hub.push(envelope);
    };
    this.turnHubs.set(sessionId, { hub, assistantMessageId, userMessageId });
    this.activePushes.set(sessionId, push);
    this.activeTurnMessageIds.set(sessionId, messageId);
    this.busySessions.add(sessionId);
    this.sessionActivity.notifyBusy(sessionId);

    this.store.appendEvent(sessionId, {
      type: 'message',
      role: 'user',
      content: message.message,
      messageId: userMessageId,
      ...(imageRefs.length ? { images: imageRefs } : {}),
    });
    this.context.appendConversation(sessionId, `\nUser: ${message.message}`);

    // permission / mode-suggest router 已在构造时安装

    const checkAbort = () => {
      if (abort.signal.aborted) throw new Error('Aborted');
    };

    const run = async () => {
      checkAbort();

      const gate = this.gateFor(ctx);

      if (message.enabledMcp) {
        this.mcp.setSessionEnabled(sessionId, message.enabledMcp);
      }
      const enabledMcpIds = new Set(this.mcp.getSessionEnabled(sessionId));

      const { mem: memoryAdv, rulesAdv, skillAdv } = assembleAndPushInjections({
        push,
        memory: this.memory,
        skills: this.skills,
        rules: this.rules,
        maxInjectTokens: this.config.skill.maxInjectTokens,
        userMessage: message.message,
        sessionId,
        messageId,
        enabledMcpIds,
      });

      // A7 Mock：短 thinking 脉冲，无需真实 thinking 模型
      push(
        makeEnvelope('thinking', { delta: 'Considering the request…' }, sessionId, messageId),
      );
      push(
        makeEnvelope('thinking', { delta: ' Planning next steps.' }, sessionId, messageId),
      );

      const taskMatch = message.message.match(
        /\btask\s+(explore|verify|shell|browser)(?:\s+(bg))?\s+<<<([\s\S]+?)>>>/i,
      );
      if (taskMatch) {
        const subagentType = taskMatch[1]!.toLowerCase() as
          | 'explore'
          | 'verify'
          | 'shell'
          | 'browser';
        const background = Boolean(taskMatch[2]);
        const prompt = taskMatch[3]!.trim();
        const toolCallId = randomUUID();
        push(
          makeEnvelope(
            'tool_call_start',
            {
              toolCallId,
              toolName: 'Task',
              toolInput: {
                subagent_type: subagentType,
                prompt,
                ...(background ? { run_in_background: true } : {}),
              },
            },
            sessionId,
            messageId,
          ),
        );
        const result = await this.subagents.runExplore({
          parentSessionId: sessionId,
          workspace: ctx.workspace,
          prompt,
          subagentType,
          push,
          background,
          onSettled: background
            ? (settled) => this.enqueueBackgroundResult(sessionId, settled)
            : undefined,
        });
        if (result.status === 'running' && result.taskId) {
          this.noteBackgroundTaskStarted(sessionId, result.taskId);
        } else {
          this.context.appendSubagents(
            sessionId,
            (result.summary ? JSON.stringify(result.summary) : result.toolResultText) +
              '\n',
          );
        }
        this.persistToolTurn(sessionId, toolCallId, 'Task', {
          toolInput: {
            subagent_type: subagentType,
            prompt,
            ...(background ? { run_in_background: true } : {}),
          },
          resultPreview: result.toolResultText.slice(0, 500),
        });
        push(
          makeEnvelope(
            'tool_call_result',
            {
              toolCallId,
              toolName: 'Task',
              resultPreview: result.toolResultText.slice(0, 500),
              status:
                result.status === 'running'
                  ? 'ok'
                  : result.ok
                    ? 'ok'
                    : 'error',
            },
            sessionId,
            messageId,
          ),
        );
        push(
          makeEnvelope(
            'token',
            {
              delta:
                result.status === 'running'
                  ? `Explore started in background (${result.taskId.slice(0, 8)}…)`
                  : result.ok
                    ? `Explore completed (${result.summary?.confidence ?? 'ok'})`
                    : `Explore ${result.status}: ${result.error ?? 'failed'}`,
            },
            sessionId,
            messageId,
          ),
        );
      } else {
      const webfetchMatch = message.message.match(/\bwebfetch\s+<<<([\s\S]+?)>>>/i);
      const writeMatch = message.message.match(/\bwrite\s+(\S+)\s+<<<([\s\S]+?)>>>/i);
      const editMatch = message.message.match(/\bedit\s+(\S+)\s+<<<([\s\S]+?)>>>/i);
      const bashMatch = message.message.match(/\bbash\s+<<<([\s\S]+?)>>>/i);
      const writeWord = /\b(write|edit|bash)\b/i.test(message.message);

      if (webfetchMatch) {
          const url = webfetchMatch[1]!.trim();
          const policyResult = await gate('WebFetch', { url });
          if (isPolicyBlocked(policyResult)) {
            push(
              makeEnvelope(
                'error',
                { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                sessionId,
                messageId,
              ),
            );
            return;
          }
          const toolCallId = randomUUID();
          push(
            makeEnvelope(
              'tool_call_start',
              { toolCallId, toolName: 'WebFetch', toolInput: { url } },
              sessionId,
              messageId,
            ),
          );
          const tool = createWebFetchTool(gate);
          const fetched = await tool.execute(
            toolCallId,
            { url },
            undefined as never,
            undefined as never,
            undefined as never,
          );
          const preview =
            fetched.content[0] && 'text' in fetched.content[0]
              ? fetched.content[0].text.slice(0, 500)
              : '';
          this.persistToolTurn(sessionId, toolCallId, 'WebFetch', {
            toolInput: { url },
            resultPreview: preview,
          });
          push(
            makeEnvelope(
              'tool_call_result',
              {
                toolCallId,
                toolName: 'WebFetch',
                resultPreview: preview,
                status: fetched.details.error ? 'error' : 'ok',
              },
              sessionId,
              messageId,
            ),
          );
          push(
            makeEnvelope(
              'token',
              {
                delta: fetched.details.error ? `WebFetch failed: ${preview}` : preview.slice(0, 200),
              },
              sessionId,
              messageId,
            ),
          );
        } else if (writeMatch) {
          const path = writeMatch[1]!;
          const content = writeMatch[2]!;
          const policyResult = await gate('write', { path, content });
          if (isPolicyBlocked(policyResult)) {
            push(
              makeEnvelope(
                'error',
                { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                sessionId,
                messageId,
              ),
            );
            return;
          }
          const toolCallId = randomUUID();
          push(
            makeEnvelope(
              'tool_call_start',
              { toolCallId, toolName: 'write', toolInput: { path } },
              sessionId,
              messageId,
            ),
          );
          const abs = assertWritable(ctx.workspace, path);
          const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content, 'utf-8');
          const summary = `Wrote ${content.length} bytes`;
          const { text: unifiedDiff, truncated } = buildUnifiedDiff(path, before, content);
          const change: FileChangeRecord = {
            path,
            operation: 'write',
            summary,
            unifiedDiff,
            ts: Date.now(),
            toolCallId,
            truncated,
            disposition: 'pending',
            reviewable: true,
          };
          recordFileChangeReviewShared(this.store, sessionId, path, before, content);
          this.store.appendEvent(sessionId, {
            type: 'file_edit',
            ...change,
          });
          this.persistToolTurn(sessionId, toolCallId, 'write', {
            toolInput: { path },
            resultPreview: summary,
          });
          push(makeEnvelope('file_changed', change, sessionId, messageId));
          this.consecutiveToolFailures.set(sessionId, 0);
          push(
            makeEnvelope(
              'tool_call_result',
              { toolCallId, toolName: 'write', resultPreview: summary },
              sessionId,
              messageId,
            ),
          );
          push(makeEnvelope('token', { delta: `Wrote ${path}` }, sessionId, messageId));
        } else if (editMatch) {
          const path = editMatch[1]!;
          const newString = editMatch[2]!;
          const policyResult = await gate('edit', { path, new_string: newString });
          if (isPolicyBlocked(policyResult)) {
            push(
              makeEnvelope(
                'error',
                { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                sessionId,
                messageId,
              ),
            );
            return;
          }
          const toolCallId = randomUUID();
          push(
            makeEnvelope(
              'tool_call_start',
              { toolCallId, toolName: 'edit', toolInput: { path } },
              sessionId,
              messageId,
            ),
          );
          const abs = assertWritable(ctx.workspace, path);
          const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
          writeFileSync(abs, newString, 'utf-8');
          const summary = `Edited ${path}`;
          const { text: unifiedDiff, truncated } = buildUnifiedDiff(path, before, newString);
          const change: FileChangeRecord = {
            path,
            operation: 'edit',
            summary,
            unifiedDiff,
            ts: Date.now(),
            toolCallId,
            truncated,
            disposition: 'pending',
            reviewable: true,
          };
          recordFileChangeReviewShared(this.store, sessionId, path, before, newString);
          this.store.appendEvent(sessionId, {
            type: 'file_edit',
            ...change,
          });
          this.persistToolTurn(sessionId, toolCallId, 'edit', {
            toolInput: { path },
            resultPreview: summary,
          });
          push(makeEnvelope('file_changed', change, sessionId, messageId));
          this.consecutiveToolFailures.set(sessionId, 0);
          push(
            makeEnvelope(
              'tool_call_result',
              { toolCallId, toolName: 'edit', resultPreview: summary },
              sessionId,
              messageId,
            ),
          );
          push(makeEnvelope('token', { delta: `Edited ${path}` }, sessionId, messageId));
        } else if (bashMatch) {
          const command = bashMatch[1]!.trim();
          const toolCallId = randomUUID();
          // 先落卡再 ask，便于 TerminalCard 按 toolCallId 挂确认态
          push(
            makeEnvelope(
              'tool_call_start',
              { toolCallId, toolName: 'bash', toolInput: { command } },
              sessionId,
              messageId,
            ),
          );
          const policyResult = await gate('bash', { command }, { toolCallId });
          if (isPolicyBlocked(policyResult)) {
            push(
              makeEnvelope(
                'tool_call_result',
                {
                  toolCallId,
                  toolName: 'bash',
                  resultPreview: policyBlockMessage(policyResult),
                  isError: true,
                },
                sessionId,
                messageId,
              ),
            );
            return;
          }
          const result = await runSandboxed({ cwd: ctx.workspace, command });
          const isError = result.timedOut || result.exitCode !== 0;
          if (isError) {
            const n = (this.consecutiveToolFailures.get(sessionId) ?? 0) + 1;
            this.consecutiveToolFailures.set(sessionId, n);
          } else {
            this.consecutiveToolFailures.set(sessionId, 0);
          }
          push(
            makeEnvelope(
              'tool_call_result',
              {
                toolCallId,
                toolName: 'bash',
                resultPreview: (result.stdout || result.stderr).slice(0, 200),
                isError,
              },
              sessionId,
              messageId,
            ),
          );
          this.persistToolTurn(sessionId, toolCallId, 'bash', {
            toolInput: { command },
            resultPreview: (result.stdout || result.stderr).slice(0, 200),
            isError,
          });
          push(
            makeEnvelope(
              'token',
              { delta: result.stdout.slice(0, 300) || `exit ${result.exitCode}` },
              sessionId,
              messageId,
            ),
          );
        } else if (writeWord && ctx.mode === 'ask') {
          const toolName =
            message.message.match(/\b(write|edit|bash)\b/i)?.[1]?.toLowerCase() ?? 'write';
          const policyResult = await gate(toolName, {});
          if (isPolicyBlocked(policyResult)) {
            push(
              makeEnvelope(
                'error',
                { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                sessionId,
                messageId,
              ),
            );
            return;
          }
        } else {
          const listMatch = message.message.match(/list(?:_files)?(?:\s+(\S+))?/i);
          const grepMatch = message.message.match(/grep\s+(\S+)(?:\s+(\S+))?/i);
          const readMatch =
            message.message.match(/read\s+(\S+)/i) ??
            message.message.match(/(\S+\.(?:md|ts|tsx|js|json|yaml|yml|txt|java|py))/i);

          if (listMatch && /list/i.test(message.message)) {
            const path = listMatch[1] ?? '.';
            const policyResult = await gate('list_files', { path });
            if (isPolicyBlocked(policyResult)) {
              push(
                makeEnvelope(
                  'error',
                  { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                  sessionId,
                  messageId,
                ),
              );
              return;
            }
            const toolCallId = randomUUID();
            push(
              makeEnvelope(
                'tool_call_start',
                { toolCallId, toolName: 'list_files', toolInput: { path } },
                sessionId,
                messageId,
              ),
            );
            const { readdirSync } = await import('node:fs');
            const { assertReadable } = await import('@ciro-code/harness-core');
            const abs = assertReadable(ctx.workspace, path);
            const entries = existsSync(abs) ? readdirSync(abs).slice(0, 50) : [];
            const preview = entries.join('\n') || '(empty)';
            this.trackToolResult(sessionId, toolCallId, 'list_files', preview);
            this.persistToolTurn(sessionId, toolCallId, 'list_files', {
              toolInput: { path },
              resultPreview: preview.slice(0, 300),
            });
            push(
              makeEnvelope(
                'tool_call_result',
                { toolCallId, toolName: 'list_files', resultPreview: preview.slice(0, 300) },
                sessionId,
                messageId,
              ),
            );
            push(
              makeEnvelope(
                'token',
                { delta: `Contents of ${path}:\n${preview}` },
                sessionId,
                messageId,
              ),
            );
          } else if (grepMatch) {
            const pattern = grepMatch[1]!;
            const path = grepMatch[2] ?? '.';
            const policyResult = await gate('grep', { pattern, path });
            if (isPolicyBlocked(policyResult)) {
              push(
                makeEnvelope(
                  'error',
                  { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                  sessionId,
                  messageId,
                ),
              );
              return;
            }
            const toolCallId = randomUUID();
            push(
              makeEnvelope(
                'tool_call_start',
                { toolCallId, toolName: 'grep', toolInput: { pattern, path } },
                sessionId,
                messageId,
              ),
            );
            const preview = `Mock grep for /${pattern}/ under ${path}`;
            this.trackToolResult(sessionId, toolCallId, 'grep', preview.repeat(20));
            this.persistToolTurn(sessionId, toolCallId, 'grep', {
              toolInput: { pattern, path },
              resultPreview: preview,
            });
            push(
              makeEnvelope(
                'tool_call_result',
                { toolCallId, toolName: 'grep', resultPreview: preview },
                sessionId,
                messageId,
              ),
            );
            push(makeEnvelope('token', { delta: preview }, sessionId, messageId));
          } else if (readMatch) {
            const path = readMatch[1]!;
            const policyResult = await gate('read', { path });
            if (isPolicyBlocked(policyResult)) {
              push(
                makeEnvelope(
                  'error',
                  { message: policyBlockMessage(policyResult), code: 'POLICY_DENY' },
                  sessionId,
                  messageId,
                ),
              );
              return;
            }
            const toolCallId = randomUUID();
            push(
              makeEnvelope(
                'tool_call_start',
                { toolCallId, toolName: 'read', toolInput: { path } },
                sessionId,
                messageId,
              ),
            );
            const { assertReadable } = await import('@ciro-code/harness-core');
            const abs = assertReadable(ctx.workspace, path);
            const text = existsSync(abs) ? readFileSync(abs, 'utf-8').slice(0, 500) : 'File not found';
            this.trackToolResult(sessionId, toolCallId, 'read', text);
            this.persistToolTurn(sessionId, toolCallId, 'read', {
              toolInput: { path },
              resultPreview: text.slice(0, 200),
            });
            push(
              makeEnvelope(
                'tool_call_result',
                { toolCallId, toolName: 'read', resultPreview: text.slice(0, 200) },
                sessionId,
                messageId,
              ),
            );
            push(
              makeEnvelope(
                'token',
                { delta: `Here is a summary of ${path}:\n\n${text.slice(0, 300)}` },
                sessionId,
                messageId,
              ),
            );
          } else {
            push(
              makeEnvelope(
                'token',
                { delta: `Mock (${ctx.mode}) response to: ${message.message}` },
                sessionId,
                messageId,
              ),
            );
          }
        }
      }

      checkAbort();
      await this.finishBackgroundTasksInTurn(sessionId, push, messageId);
      checkAbort();
      const assistantPreview = assistantText || 'mock';
      this.context.appendConversation(sessionId, `\nAssistant: ${assistantPreview}`);
      const snap = this.context.refresh(sessionId, {
        system: this.modeProfiles.systemPromptForMode(ctx.mode),
        tools: toolsForMode(this.modeProfiles, ctx.mode).join('\n'),
        memory: memoryAdv.injection,
        rules: rulesAdv.injection,
        skills: skillAdv.injection,
        subagents: this.context.getSubagents(sessionId),
        summarized: this.context.getSummarized(sessionId),
        toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(sessionId) ?? []),
      });
      this.compaction.noteTurn(ctx.workspace, {
        userMessage: message.message,
        assistantPreview,
        toolNames: (this.toolResults.get(sessionId) ?? []).slice(-5).map((t) => t.toolName),
      });

      flushThinkingSegment();
      flushAssistantSegment();
      if (!assistantText) {
        this.store.appendEvent(sessionId, {
          type: 'message',
          role: 'assistant',
          messageId: assistantMessageId,
          content: 'mock',
          tokenEstimate: this.context.get(sessionId)?.totalTokens ?? snap.totalTokens,
        });
      }
      this.store.appendEvent(sessionId, {
        type: 'turn_complete',
        messageId: assistantMessageId,
        workedMs: Math.max(0, Date.now() - turnStartedAt),
      });

      await emitAutoCompaction({
        push,
        compaction: this.compaction,
        context: this.context,
        sessionId,
        messageId,
        fallbackSnapshot: snap,
        compactionBias: this.modeProfiles.getModeProfile(ctx.mode).compactionBias,
        compactSession: (id, o) => this.compactSession(id, o),
      });

      push(makeEnvelope('complete', { messageId }, sessionId, messageId));
      push(
        makeEnvelope(
          'context_usage',
          this.context.get(sessionId) ?? snap,
          sessionId,
          messageId,
        ),
      );
    };

    try {
      let finished = false;
      void run()
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          push(
            makeEnvelope(
              'error',
              { message: msg, code: msg === 'Aborted' ? 'ABORTED' : 'MOCK_ERROR' },
              sessionId,
              messageId,
            ),
          );
        })
        .finally(() => {
          finished = true;
          hub.finish();
          this.abortControllers.delete(sessionId);
          const dbg = this.debugSessions.get(sessionId);
          if (dbg) {
            dbg.analyzeUnlocked = false;
            dbg.cleanupUnlocked = false;
          }
          this.clearActiveTurn(sessionId);
        });

      yield* hub.subscribe(0);
      void finished;
    } catch {
      // subscribe 被取消（HTTP 断连）时不 abort turn
    }
  }

  async steerInFlight(
    sessionId: string,
    message: UserMessage,
  ): Promise<{ messageId: string }> {
    const session = this.store.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Session not found');
    }
    if (!this.busySessions.has(sessionId)) {
      throw new Error('SESSION_IDLE: Session is not streaming');
    }

    const userMessageId =
      typeof message.messageId === 'string' && message.messageId.trim()
        ? message.messageId.trim()
        : randomUUID();

    let imageRefs: ReturnType<typeof persistChatImages> = [];
    const validatedImages = validateChatImages(message.images);
    if (validatedImages.length > 0) {
      imageRefs = persistChatImages(this.sessionDir(sessionId), userMessageId, validatedImages);
    }

    const deliverAs =
      message.deliverAs === 'followUp' || message.deliverAs === 'steer'
        ? message.deliverAs
        : 'steer';

    this.store.appendEvent(sessionId, {
      type: 'message',
      role: 'user',
      content: message.message,
      messageId: userMessageId,
      deliverAs,
      ...(imageRefs.length ? { images: imageRefs } : {}),
    });
    this.context.appendConversation(sessionId, `\nUser: ${message.message}`);
    return { messageId: userMessageId };
  }

  async abort(sessionId: string): Promise<void> {
    this.permissions.rejectAll(sessionId);
    this.pendingBackgroundResults.delete(sessionId);
    this.turnBackgroundTasks.delete(sessionId);
    this.subagents.abortAllForParent(sessionId, 'parent_abort');
    this.abortControllers.get(sessionId)?.abort();
    this.clearActiveTurn(sessionId);
  }

  async abortSubagent(_parentSessionId: string, taskId: string): Promise<boolean> {
    return this.subagents.abortTask(taskId, 'user');
  }

  listSubagents(parentSessionId: string): SubagentRunMeta[] {
    try {
      const dir = this.sessionDir(parentSessionId);
      this.subagents.reconcileOnResume(dir);
      return listSubagentMetas(dir);
    } catch {
      return [];
    }
  }

  getSubagent(parentSessionId: string, taskId: string): SubagentRunView | null {
    try {
      const dir = this.sessionDir(parentSessionId);
      const meta = this.subagents.getMeta(dir, taskId);
      if (!meta) return null;
      return { meta, events: readSubagentEvents(dir, taskId) };
    } catch {
      return null;
    }
  }

  clearSubagents(parentSessionId: string): void {
    try {
      this.subagents.abortAllForParent(parentSessionId, 'parent_deleted');
      this.subagents.clearSubagentsOnly(this.sessionDir(parentSessionId));
    } catch {
      // ignore
    }
  }

  async *streamSubagentEvents(
    parentSessionId: string,
    taskId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>> {
    const dir = this.sessionDir(parentSessionId);
    const meta = this.subagents.getMeta(dir, taskId);
    if (!meta) return;
    yield* this.subagents.streamEvents(dir, taskId, signal);
  }

  getAvailableTools(filter?: ToolFilter): ToolDefinition[] {
    return availableToolsShared(
      this.config,
      filter,
      (name) => `${name} tool`,
      this.modeProfiles,
    );
  }
}
