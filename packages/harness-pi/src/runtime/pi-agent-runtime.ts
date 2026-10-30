import { randomUUID } from 'node:crypto';
import { ModelRuntime, type AgentSession } from '@earendil-works/pi-coding-agent';
import {
  createMinimalModeProfiles,
  defaultPresetForMode,
  resolveEffectiveContextLimit,
  toMenuThinkingLevel,
  type CompactionResult,
  type ContextUsageSnapshot,
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
  type SubagentRunMeta,
  type SubagentStopReason,
  type SubagentType,
  type SummarySchemaV1,
  debugHitlUnlockFromUserText,
  formatBackgroundTaskResultUserMessage,
  isBrowserMcpReady,
} from '@ciro-code/harness-shared';
import {
  AuditLog,
  CompactionOrchestrator,
  ContextAccountant,
  loadEffectiveConfig,
  MemoryStore,
  PermissionBroker,
  ShellAllowlistStore,
  ModeSuggestBroker,
  PlanQuestionBroker,
  PlanStore,
  PolicyEngine,
  SessionStore,
  SkillRegistry,
  RuleRegistry,
  McpManager,
  type ExtensionHost,
  countDebugLogLines,
  createSessionPolicyGate,
  defaultSessionsRoot,
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
  loadChatImagesFromRefs,
  ChatImageValidationError,
  sumToolPayloadTokens,
  createLiveContextUsageEmitter,
  type LiveContextUsageEmitter,
} from '@ciro-code/harness-core';
import {
  assembleAndPushInjections,
  clearActiveTurnShared,
  installModeSuggestPushRouter,
  installPlanQuestionPushRouter,
  installPermissionPushRouter,
  type SsePush,
  availableToolsShared,
  buildResumeSeedMessagesShared,
  compactSessionShared,
  confirmPlanShared,
  createSessionActivityHub,
  createTurnHub,
  emitAutoCompaction,
  forkChatSessionShared,
  getPlanShared,
  listAuditShared,
  acceptFileChangeShared,
  listFileChangesShared,
  listPlansShared,
  latestConfirmedPlan,
  formatConfirmedPlanInjection,
  recordFileChangeReviewShared,
  rejectFileChangeShared,
  rebindWorkspaceShared,
  recoverSessionShared,
  resolveModeSuggestShared,
  resolvePlanQuestionShared,
  resolvePermissionShared,
  resolveSessionDir,
  savePlanToWorkspaceShared,
  toolsForMode,
  trackToolResultShared,
  truncateSessionHistoryShared,
  type SessionActivityHub,
} from './runtime-shared.js';
import { createSandboxedReadTool } from '../tools/read-tool.js';
import { createSandboxedListFilesTool } from '../tools/list-files-tool.js';
import { createSandboxedGrepTool } from '../tools/grep-tool.js';
import {
  createGetToolResultTool,
  createSearchTranscriptTool,
} from '../tools/transcript-tools.js';
import { createSandboxedWriteTool, createSandboxedEditTool, type OnFileEdit } from '../tools/write-edit-tool.js';
import { createSandboxedBashTool } from '../tools/bash-tool.js';
import { createWebFetchTool } from '../tools/web-fetch-tool.js';
import {
  createAskQuestionTool,
  createCreatePlanTool,
  createProposePlanTool,
  createUpdatePlanTool,
} from '../tools/plan-tools.js';
import { createSuggestModeTool } from '../tools/mode-suggest-tool.js';
import { createSandboxedDeleteFileTool } from '../tools/delete-file-tool.js';
import { createTaskTool } from '../tools/task-tool.js';
import { createTodoWriteTool } from '../tools/todo-write-tool.js';
import { createLlmExploreRunner } from '../subagent/llm-explore-runner.js';
import {
  buildMcpTools,
  mcpConnectionErrors,
  mcpToolNames,
  mcpToolsContextText,
  registerMissingMcpTools,
} from '../tools/mcp-tools.js';
import { buildExtensionTools, registerMissingExtTools } from '../tools/extension-tools.js';
import { makeEnvelope } from '../sse/envelope.js';
import { resolvePiModel, type PiResolvedModel } from './resolve-pi-model.js';
import { injectDebugReminder } from './debug-reminder.js';
import { createPiFullCompactSummarizer } from './compaction-summarizer.js';
import {
  createSessionPromptRefs,
  createToolRegisterHolder,
  openPiAgentSession,
  type SeedChatMessage,
  type SessionPromptRefs,
  type ToolRegisterHolder,
} from './pi-session-factory.js';
import { clipToolPreview, previewFromToolResult, toolResultIsError } from './tool-error.js';

/** UI 历史 → Pi 种子：跳过 compaction 时间线标记 */
function toPiSeedHistory(
  messages: Array<{
    role: 'user' | 'assistant' | 'compaction';
    content: string;
    images?: Array<{ path: string; mimeType: string }>;
  }>,
  sessionDir: string,
): SeedChatMessage[] {
  const out: SeedChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    out.push({
      role: m.role,
      content: m.content,
      images:
        m.role === 'user' ? loadChatImagesFromRefs(sessionDir, m.images) : undefined,
    });
  }
  return out;
}

/** rewind / fork 后 Pi 种子：有会计摘要时与 resume 同路径 */
function piHistoryAfterAccountingRebuild(
  runtime: {
    store: SessionStore;
    context: ContextAccountant;
    sessionDir: (sessionId: string) => string;
  },
  sessionId: string,
  messages: Array<{
    role: 'user' | 'assistant' | 'compaction';
    content: string;
    images?: Array<{ path: string; mimeType: string }>;
  }>,
): SeedChatMessage[] {
  const summarized = runtime.context.getSummarized(sessionId).trim();
  if (summarized.length > 0) {
    return buildResumeSeedMessagesShared({
      store: runtime.store,
      context: runtime.context,
      sessionId,
      uiMessages: messages,
    }).map((m) => ({ role: m.role, content: m.content }));
  }
  return toPiSeedHistory(messages, runtime.sessionDir(sessionId));
}

function emitFileChange(
  sessionId: string,
  store: SessionStore,
  push: ((envelope: SseEnvelope) => void) | null | undefined,
  change: FileChangeRecord,
): void {
  store.appendEvent(sessionId, {
    type: 'file_edit',
    path: change.path,
    operation: change.operation,
    summary: change.summary,
    unifiedDiff: change.unifiedDiff,
    truncated: change.truncated ?? false,
    toolCallId: change.toolCallId,
  });
  push?.(makeEnvelope('file_changed', change, sessionId));
}

interface PiSessionEntry {
  handle: SessionHandle;
  piSession: AgentSession;
  refs: SessionPromptRefs;
  appliedModelRef?: ModelRef;
  confirmedPlanMarkdown?: string;
  confirmedPlanId?: string;
  /** 本轮已激活的 mcp:* 工具名 */
  mcpActiveNames?: string[];
  /** Extension registerTool；中途启用 MCP 热补 */
  toolRegister: ToolRegisterHolder;
  /** Task schema 当前是否向模型暴露 browser */
  browserTaskExposed?: boolean;
}

interface RuntimeDebugState {
  info: DebugSessionInfo;
  handle: DebugIngestHandle | null;
  /** Proceed / Mark as fixed 后本轮可读 log */
  analyzeUnlocked?: boolean;
  /** Mark as fixed 后本轮允许去掉探针 */
  cleanupUnlocked?: boolean;
}

interface BuildToolsOptions {
  workspace: string;
  gate: ToolPolicyGate;
  sessionId: string;
  /** ~/.ciro/sessions/{id} — transcript / tool-results 回查 */
  sessionDir: string;
  planStore: PlanStore;
  modeSuggests: ModeSuggestBroker;
  questionsBroker: PlanQuestionBroker;
  getCurrentMode: () => HarnessMode;
  onModeSwitched?: (mode: HarnessMode, previousMode: HarnessMode) => void | Promise<void>;
  push?: (envelope: SseEnvelope) => void;
  onPlanWritten?: (event: {
    type: 'plan_created' | 'plan_updated';
    planId: string;
    title: string;
  }) => void;
  getConfirmedPlanId?: () => string | undefined;
  onPlanTodosSynced?: (plan: PlanRecord) => void;
  getDebugLogPath?: () => string | undefined;
  onFileEdit?: OnFileEdit;
  mcpTools?: ReturnType<typeof buildMcpTools>;
  extTools?: ReturnType<typeof buildExtensionTools>;
  orchestrator: SubagentOrchestrator;
  onTaskResult?: (result: {
    ok: boolean;
    toolResultText: string;
    summary?: SummarySchemaV1;
  }) => void;
  onBackgroundStarted?: (taskId: string) => void;
  onBackgroundSettled?: (result: TaskExploreResult) => void;
  /** Task schema 是否含 browser（能力闸门） */
  includeBrowser?: boolean;
  isBrowserAvailable?: () => boolean;
  /** read 工具投图前检查当前会话模型 Vision */
  getSupportsVision?: () => boolean;
}

/** 注册全部已实现工具；Mode 白名单由 setActiveToolsByName 控制 */
function buildAllTools(opts: BuildToolsOptions) {
  const {
    workspace,
    gate,
    sessionId,
    sessionDir,
    planStore,
    modeSuggests,
    questionsBroker,
    getCurrentMode,
    onModeSwitched,
    push,
    onPlanWritten,
    getConfirmedPlanId,
    onPlanTodosSynced,
    getDebugLogPath,
    onFileEdit,
    mcpTools = [],
    extTools = [],
    orchestrator,
    onTaskResult,
    onBackgroundStarted,
    onBackgroundSettled,
    includeBrowser,
    isBrowserAvailable,
    getSupportsVision,
  } = opts;
  const tools = [
    createSandboxedReadTool(workspace, gate, { getSupportsVision }),
    createSandboxedListFilesTool(workspace, gate),
    createSandboxedGrepTool(workspace, gate),
    createSearchTranscriptTool(sessionDir, gate),
    createGetToolResultTool(sessionDir, gate),
    createSandboxedWriteTool(workspace, gate, onFileEdit),
    createSandboxedEditTool(workspace, gate, onFileEdit),
    createSandboxedBashTool(workspace, gate),
    createWebFetchTool(gate),
    createSandboxedDeleteFileTool({
      workspace,
      gate,
      getAllowedLogPath: getDebugLogPath,
    }),
  ];
  const planCtx = { sessionId, planStore, gate, push, onPlanWritten, questionsBroker };
  return [
    ...tools,
    createSuggestModeTool({
      sessionId,
      broker: modeSuggests,
      getCurrentMode,
      onSwitched: onModeSwitched,
      gate,
    }),
    createAskQuestionTool(planCtx),
    createCreatePlanTool(planCtx),
    createUpdatePlanTool(planCtx),
    createProposePlanTool(planCtx),
    createTodoWriteTool({
      sessionId,
      planStore,
      gate,
      push,
      onPlanWritten,
      getConfirmedPlanId: getConfirmedPlanId ?? (() => undefined),
      onPlanTodosSynced,
    }),
    createTaskTool({
      sessionId,
      workspace,
      orchestrator,
      gate,
      push,
      getSubagentDepth: () => 0,
      onResult: onTaskResult,
      onBackgroundStarted,
      onBackgroundSettled,
      includeBrowser,
      isBrowserAvailable,
    }),
    ...mcpTools,
    ...extTools,
  ];
}

interface PendingBackgroundTaskResult {
  taskId: string;
  subagentType: SubagentType;
  status: 'completed' | 'failed' | 'stopped';
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
}

function disposePiSession(session: AgentSession): void {
  try {
    session.dispose();
  } catch {
    // ignore
  }
}

export class PiAgentRuntime implements AgentRuntime {
  private readonly store: SessionStore;
  private readonly policy = new PolicyEngine();
  private readonly permissions: PermissionBroker;
  private readonly shellAllowlist: ShellAllowlistStore;
  private readonly modeSuggests: ModeSuggestBroker;
  private readonly questionsBroker: PlanQuestionBroker;
  private readonly audit: AuditLog;
  private memory: MemoryStore;
  private skills: SkillRegistry;
  private rules: RuleRegistry;
  private mcp: McpManager;
  private readonly extensionHost: ExtensionHost | undefined;
  private readonly context: ContextAccountant;
  private readonly compaction: CompactionOrchestrator;
  private readonly modeProfiles: ModeProfileProvider;
  private readonly toolResults = new Map<string, ToolResultRecord[]>();
  private readonly sessions = new Map<string, PiSessionEntry>();
  private readonly debugSessions = new Map<string, RuntimeDebugState>();
  private modelRuntime: ModelRuntime | null = null;
  private readonly config: HarnessConfig;
  private readonly providerStore: ProviderStore | undefined;
  private readonly planStore: PlanStore;
  /** C4d：按 sessionId 扇出 SSE（替换原全局单槽 activePush） */
  private readonly activePushes = new Map<string, SsePush>();
  private readonly activeTurnMessageIds = new Map<string, string>();
  /** C4d-S3：turn 缓冲，供 detach 后 attach 重放 */
  private readonly turnHubs = new Map<
    string,
    {
      hub: ReturnType<typeof createTurnHub>;
      assistantMessageId: string;
      userMessageId: string;
    }
  >();
  /** sessionId → 连续 tool 失败次数（成功则清零） */
  private readonly consecutiveToolFailures = new Map<string, number>();
  /** C4c 忙锁；C4d 同会话互斥、异会话可并行 */
  private readonly busySessions = new Set<string>();
  private readonly sessionActivity: SessionActivityHub;
  private readonly subagents: SubagentOrchestrator;
  /** 后台 Task 终态 → 同轮续跑队列（不写用户气泡） */
  private readonly pendingBackgroundResults = new Map<string, PendingBackgroundTaskResult[]>();
  /** 本 turn 内仍在跑的后台 taskId（用于 waitForIdle 后挡住 complete） */
  private readonly turnBackgroundTasks = new Map<string, Set<string>>();

  constructor(config: HarnessConfig, options: CreateRuntimeOptions = {}) {
    this.config = config;
    this.modeProfiles = options.modeProfiles ?? createMinimalModeProfiles();
    this.providerStore = options.providerStore;
    this.sessionActivity =
      (options.sessionActivity as SessionActivityHub | undefined) ??
      createSessionActivityHub();
    this.store =
      options.sessionStore ??
      new SessionStore({ snapshotInterval: config.session.snapshotInterval });
    this.planStore = new PlanStore({
      sessionsRoot: this.store.eventLog?.sessionsRoot ?? defaultSessionsRoot(),
    });
    this.audit = options.auditLog ?? new AuditLog();
    this.permissions = options.permissionBroker ?? new PermissionBroker();
    this.shellAllowlist = options.shellAllowlist ?? new ShellAllowlistStore();
    this.modeSuggests = new ModeSuggestBroker();
    this.questionsBroker = new PlanQuestionBroker();
    this.mcp = options.mcpManager ?? new McpManager({ workspace: config.workspace });
    this.subagents = new SubagentOrchestrator({
      config: config.subagents,
      resolveSessionDir: (id) => {
        try {
          return resolveSessionDir(this.store, this.config.workspace, id);
        } catch {
          return null;
        }
      },
      exploreRunner: createLlmExploreRunner({
        policy: this.policy,
        audit: this.audit,
        permissions: this.permissions,
        shellAllowlist: this.shellAllowlist,
        providerStore: this.providerStore,
        mcpManager: this.mcp,
        getParentMcpEnabled: (parentId) => this.mcp.getSessionEnabled(parentId),
        getModelRuntime: () => this.getModelRuntime(),
        getParentModelRef: (parentId) => this.store.get(parentId)?.modelRef,
        /** 每次 Task/explore 读盘：设置页改完后下次 send 生效 */
        getExploreModel: () =>
          loadEffectiveConfig({ workspace: this.config.workspace }).config.subagents
            .exploreModel,
      }),
    });
    this.memory = options.memoryStore ?? new MemoryStore(config.workspace);
    this.skills =
      options.skillRegistry ??
      new SkillRegistry({
        workspace: config.workspace,
        maxInjectTokens: config.skill.maxInjectTokens,
      });
    this.rules = new RuleRegistry({ workspace: config.workspace });
    this.extensionHost = options.extensionHost;
    this.extensionHost?.setUiSink((level, message) => {
      if (this.activePushes.size === 0) return;
      for (const [sessionId, push] of this.activePushes) {
        const messageId = this.activeTurnMessageIds.get(sessionId);
        push(makeEnvelope('ui_notify', { level, message }, sessionId, messageId));
      }
    });
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
      createPiFullCompactSummarizer({
        getModelRuntime: () => this.getModelRuntime(),
        providerStore: this.providerStore,
        getPreferredModelRef: (sessionId) => {
          if (!sessionId) return this.providerStore?.resolveEffectiveModelRef(null) ?? null;
          const entry = this.sessions.get(sessionId);
          const handle = this.store.get(sessionId) ?? entry?.handle;
          return (
            entry?.appliedModelRef ??
            handle?.modelRef ??
            this.providerStore?.resolveEffectiveModelRef(null) ??
            null
          );
        },
      }),
    );
    installPermissionPushRouter(this.permissions, (sessionId) => {
      const push = this.activePushes.get(sessionId);
      const messageId = this.activeTurnMessageIds.get(sessionId);
      if (!push || messageId == null) return undefined;
      return { push, messageId };
    });
    installModeSuggestPushRouter(this.modeSuggests, (sessionId) => {
      const push = this.activePushes.get(sessionId);
      const messageId = this.activeTurnMessageIds.get(sessionId);
      if (!push || messageId == null) return undefined;
      return { push, messageId };
    });
    installPlanQuestionPushRouter(this.questionsBroker, (sessionId) => {
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

  /**
   * 同轮续跑：父 agent 首轮 idle 后，等待本 turn 后台 Task 终态，
   * 将 summary 注入模型并继续 prompt（不写 role:user 气泡、不开新 send）。
   */
  private async finishBackgroundTasksInTurn(
    sessionId: string,
    entry: {
      piSession: { prompt: (text: string) => Promise<unknown>; agent: { waitForIdle: () => Promise<unknown> } };
    },
  ): Promise<void> {
    const timeoutMs = this.config.subagents?.timeoutMs ?? 10 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    while (this.busySessions.has(sessionId) && Date.now() < deadline) {
      const awaiting = this.turnBackgroundTasks.get(sessionId);
      const pending = this.pendingBackgroundResults.get(sessionId);
      const hasAwaiting = Boolean(awaiting && awaiting.size > 0);
      const hasPending = Boolean(pending && pending.length > 0);
      if (!hasAwaiting && !hasPending) return;

      while (
        this.busySessions.has(sessionId) &&
        (this.turnBackgroundTasks.get(sessionId)?.size ?? 0) > 0 &&
        Date.now() < deadline
      ) {
        await sleep(40);
      }
      if (!this.busySessions.has(sessionId)) return;

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

      const promptText = formatBackgroundTaskResultUserMessage({
        taskId: item.taskId,
        subagent_type: item.subagentType,
        status: item.status,
        summary: item.summary,
        error: item.error,
        reason: item.reason,
      });
      // 仅 prompt 进模型；summary 已入 subagents 桶；不落盘 role:user
      try {
        await entry.piSession.prompt(promptText);
        await entry.piSession.agent.waitForIdle();
      } catch (err) {
        console.warn('background same-turn continue failed', sessionId, err);
        return;
      }
    }
  }

  /** 仅连接本会话启用集并构建工具；中途新启用经 Extension registerTool 热补 */
  private async prepareMcpTools(
    sessionId: string,
    gate: ToolPolicyGate,
  ): Promise<{
    tools: ReturnType<typeof buildMcpTools>;
    activeNames: string[];
    contextText: string;
    enabled: string[];
  }> {
    const enabled = this.mcp.getSessionEnabled(sessionId);
    await this.mcp.ensureConnected(enabled);
    const tools = buildMcpTools(this.mcp, enabled, gate);
    const activeNames = mcpToolNames(this.mcp, enabled);
    const contextText = mcpToolsContextText(this.mcp, enabled);
    return { tools, activeNames, contextText, enabled };
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

    await this.rebuildPiFromSeed(sessionId, shared.seedMessages);

    const handle = this.store.get(sessionId) ?? this.sessions.get(sessionId)?.handle;
    const seedConversation = shared.seedMessages
      .map((m) => (m.role === 'user' ? `\nUser: ${m.content}` : `\nAssistant: ${m.content}`))
      .join('');
    if (handle) {
      const contextUsage = this.context.refresh(sessionId, {
        system: this.modeProfiles.systemPromptForMode(handle.mode),
        tools: [...this.modeProfiles.toolsForMode(handle.mode)].join('\n'),
        conversation: seedConversation,
        summarized: '',
        toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(sessionId) ?? []),
      });
      return { result: shared.result, contextUsage };
    }
    return { result: shared.result, contextUsage: shared.contextUsage };
  }

  /** dispose 当前 Pi 并用压缩种子重建（UI events 不截断） */
  private async rebuildPiFromSeed(
    sessionId: string,
    seedMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void> {
    const existing = this.sessions.get(sessionId);
    const handle = this.store.get(sessionId) ?? existing?.handle;
    if (!handle) return;

    if (existing) {
      await existing.piSession.abort?.();
      disposePiSession(existing.piSession);
      this.sessions.delete(sessionId);
    }

    const history: SeedChatMessage[] = seedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const piOpened = await this.openPiSession(handle, history);
    this.sessions.set(sessionId, {
      handle,
      piSession: piOpened.session,
      refs: piOpened.refs,
      appliedModelRef: piOpened.appliedModelRef,
      mcpActiveNames: piOpened.mcpActiveNames,
      toolRegister: piOpened.toolRegister,
      browserTaskExposed: this.isBrowserMcpReadyForSession(sessionId),
    });
    this.bindLatestConfirmedPlan(sessionId);
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

    const existing = this.sessions.get(sessionId);
    if (existing) {
      await existing.piSession.abort?.();
      disposePiSession(existing.piSession);
      this.sessions.delete(sessionId);
    }

    const hasSummary = state.summarizedText.trim().length > 0;
    const seed = buildResumeSeedMessagesShared({
      store: this.store,
      context: this.context,
      sessionId,
      uiMessages: state.messages,
    });
    const history: SeedChatMessage[] = hasSummary
      ? seed.map((m) => ({ role: m.role, content: m.content }))
      : toPiSeedHistory(state.messages, this.sessionDir(sessionId));

    const piOpened = await this.openPiSession(state.handle, history);
    this.sessions.set(sessionId, {
      handle: state.handle,
      piSession: piOpened.session,
      refs: piOpened.refs,
      appliedModelRef: piOpened.appliedModelRef,
      mcpActiveNames: piOpened.mcpActiveNames,
      toolRegister: piOpened.toolRegister,
      browserTaskExposed: this.isBrowserMcpReadyForSession(sessionId),
    });
    if (piOpened.appliedModelRef) {
      this.store.updateModelRef(sessionId, piOpened.appliedModelRef);
      state.handle.modelRef = piOpened.appliedModelRef;
    }
    this.hydrateDebugFromMeta(sessionId);
    this.bindLatestConfirmedPlan(sessionId);
    if (state.handle.mode === 'debug') {
      await this.startDebugSession(state.handle);
    }
    // openPiSession → syncSessionContextLimit 会再 refresh；返回会计终态，避免与 GET /context 不一致
    const contextUsage = this.context.get(sessionId) ?? state.contextUsage;
    const confirmedPlanId = latestConfirmedPlan(this.planStore, sessionId)?.planId;
    return {
      session: state.handle,
      messageCount: state.messageCount,
      eventsReplayed: state.eventsReplayed,
      stoppedAtBoundary: state.stoppedAtBoundary,
      contextUsage,
      messages: state.messages,
      ...(confirmedPlanId ? { confirmedPlanId } : {}),
    };
  }

  private async getModelRuntime(): Promise<ModelRuntime> {
    if (!this.modelRuntime) {
      this.modelRuntime = await ModelRuntime.create();
    }
    return this.modelRuntime;
  }

  private isBrowserMcpReadyForSession(sessionId: string): boolean {
    const enabled = this.mcp.getSessionEnabled(sessionId);
    const connected = this.mcp.getConnectedTools(enabled);
    return isBrowserMcpReady({ enabledServerIds: enabled, connectedTools: connected });
  }

  /** MCP 就绪态变化时重注册 Task，使 schema 含/不含 browser */
  private syncTaskToolBrowserGate(sessionId: string, gate: ToolPolicyGate): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    const ready = this.isBrowserMcpReadyForSession(sessionId);
    if (entry.browserTaskExposed === ready) return;
    const handle = this.store.get(sessionId);
    if (!handle) return;
    entry.toolRegister.registerTool?.(
      createTaskTool({
        sessionId,
        workspace: handle.workspace,
        orchestrator: this.subagents,
        gate,
        push: (envelope) => this.activePushes.get(sessionId)?.(envelope),
        getSubagentDepth: () => 0,
        onResult: (result) => {
          this.context.appendSubagents(
            sessionId,
            (result.summary ? JSON.stringify(result.summary) : result.toolResultText) +
              '\n',
          );
        },
        onBackgroundStarted: (taskId) => {
          this.noteBackgroundTaskStarted(sessionId, taskId);
        },
        onBackgroundSettled: (result) => {
          this.enqueueBackgroundResult(sessionId, result);
        },
        includeBrowser: ready,
        isBrowserAvailable: () => this.isBrowserMcpReadyForSession(sessionId),
      }),
    );
    entry.browserTaskExposed = ready;
  }

  private gateFor(sessionId: string): ToolPolicyGate {
    return createSessionPolicyGate({
      policy: this.policy,
      audit: this.audit,
      permissions: this.permissions,
      shellAllowlist: this.shellAllowlist,
      getMcpReadOnlyHint: (n) =>
        this.mcp.getReadOnlyHint(n) ?? this.extensionHost?.getReadOnlyHint(n),
      getCtx: () => {
        const handle = this.store.get(sessionId);
        const mode = handle?.mode ?? this.config.mode;
        const dbg = this.debugSessions.get(sessionId);
        return {
          mode,
          workspace: handle?.workspace ?? this.config.workspace,
          sessionId,
          preset:
            this.config.permissions?.preset ??
            this.modeProfiles.getModeProfile(mode).permissionPreset ??
            defaultPresetForMode(mode),
          debugLogPath: dbg?.handle?.logPath ?? dbg?.info.logPath,
          debugLogPathRel: dbg?.info.logPathRel,
          debugAnalyzeUnlocked: Boolean(dbg?.analyzeUnlocked),
          debugCleanupUnlocked: Boolean(dbg?.cleanupUnlocked),
        };
      },
    });
  }

  private toolNamesFor(mode: HarnessMode, mcpNames: string[]): string[] {
    return [
      ...toolsForMode(this.modeProfiles, mode),
      ...mcpNames,
      ...(this.extensionHost?.activeNames(mode) ?? []),
    ];
  }

  private async openPiSession(
    handle: SessionHandle,
    history?: SeedChatMessage[],
  ): Promise<{
    session: AgentSession;
    refs: SessionPromptRefs;
    appliedModelRef?: ModelRef;
    mcpActiveNames: string[];
    mcpContextText: string;
    toolRegister: ToolRegisterHolder;
  }> {
    const modelRuntime = await this.getModelRuntime();
    const gate = this.gateFor(handle.id);
    const mcpPack = await this.prepareMcpTools(handle.id, gate);
    await this.extensionHost?.ensureLoaded();
    const extTools = buildExtensionTools(this.extensionHost, gate);
    const customTools = buildAllTools({
      workspace: handle.workspace,
      gate,
      sessionId: handle.id,
      sessionDir: resolveSessionDir(this.store, handle.workspace, handle.id),
      planStore: this.planStore,
      modeSuggests: this.modeSuggests,
      questionsBroker: this.questionsBroker,
      getCurrentMode: () => this.store.get(handle.id)?.mode ?? handle.mode,
      onModeSwitched: async (mode, previousMode) => {
        await this.setMode(handle.id, mode);
        const push = this.activePushes.get(handle.id);
        const messageId = this.activeTurnMessageIds.get(handle.id);
        push?.(
          makeEnvelope(
            'mode_changed',
            { mode, previousMode },
            handle.id,
            messageId,
          ),
        );
      },
      push: (envelope) => this.activePushes.get(handle.id)?.(envelope),
      onPlanWritten: (event) => {
        this.store.appendEvent(handle.id, {
          type: event.type,
          planId: event.planId,
          title: event.title,
        });
      },
      getConfirmedPlanId: () => this.sessions.get(handle.id)?.confirmedPlanId,
      onPlanTodosSynced: (plan) => {
        this.applyConfirmedPlan(handle.id, plan);
      },
      getDebugLogPath: () => this.debugSessions.get(handle.id)?.handle?.logPath,
      orchestrator: this.subagents,
      onTaskResult: (result) => {
        this.context.appendSubagents(
          handle.id,
          (result.summary ? JSON.stringify(result.summary) : result.toolResultText) + '\n',
        );
      },
      onBackgroundStarted: (taskId) => {
        this.noteBackgroundTaskStarted(handle.id, taskId);
      },
      onBackgroundSettled: (result) => {
        this.enqueueBackgroundResult(handle.id, result);
      },
      onFileEdit: (change, contents) => {
        recordFileChangeReviewShared(
          this.store,
          handle.id,
          change.path,
          contents.before,
          contents.after,
        );
        emitFileChange(handle.id, this.store, this.activePushes.get(handle.id), change);
      },
      mcpTools: mcpPack.tools,
      extTools,
      includeBrowser: this.isBrowserMcpReadyForSession(handle.id),
      isBrowserAvailable: () => this.isBrowserMcpReadyForSession(handle.id),
      getSupportsVision: () => {
        const preferred =
          this.sessions.get(handle.id)?.appliedModelRef ??
          this.store.get(handle.id)?.modelRef ??
          handle.modelRef ??
          null;
        const effective =
          this.providerStore?.resolveEffectiveModelRef(preferred) ?? preferred;
        const creds =
          effective && this.providerStore
            ? this.providerStore.resolveCredentials(effective)
            : null;
        return Boolean(creds?.model.supportsVision);
      },
    });

    let model: PiResolvedModel | undefined;
    let appliedModelRef: ModelRef | undefined;

    if (this.providerStore) {
      const contextWindow = this.effectiveContextFor(handle);
      const resolved = await resolvePiModel(
        modelRuntime,
        this.providerStore,
        handle.modelRef ?? null,
        { contextWindow },
      );
      if (resolved) {
        model = resolved.model;
        appliedModelRef = resolved.modelRef;
      }
    }

    const refs = createSessionPromptRefs(this.modeProfiles.systemPromptForMode(handle.mode));
    const toolRegister = createToolRegisterHolder();
    const opened = await openPiAgentSession({
      workspace: handle.workspace,
      modePrompt: this.modeProfiles.systemPromptForMode(handle.mode),
      refs,
      customTools,
      activeToolNames: this.toolNamesFor(handle.mode, mcpPack.activeNames),
      modelRuntime,
      model,
      history,
      toolRegister,
    });
    if (handle.thinkingLevel) {
      opened.session.setThinkingLevel(handle.thinkingLevel);
    }
    this.syncSessionContextLimit(handle);
    return {
      session: opened.session,
      refs: opened.refs,
      appliedModelRef,
      mcpActiveNames: mcpPack.activeNames,
      mcpContextText: mcpPack.contextText,
      toolRegister: opened.toolRegister,
    };
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
    const { session, plan } = await confirmPlanShared(
      this.store,
      this.planStore,
      sessionId,
      planId,
      (id, mode) => this.setMode(id, mode),
    );
    this.applyConfirmedPlan(sessionId, plan);
    return { session, plan };
  }

  private applyConfirmedPlan(sessionId: string, plan: PlanRecord): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.confirmedPlanId = plan.planId;
    entry.confirmedPlanMarkdown = formatConfirmedPlanInjection(plan);
  }

  private bindLatestConfirmedPlan(sessionId: string): void {
    const plan = latestConfirmedPlan(this.planStore, sessionId);
    if (plan) this.applyConfirmedPlan(sessionId, plan);
  }

  async savePlanToWorkspace(
    sessionId: string,
    planId: string,
  ): Promise<{ pathRel: string; plan: PlanRecord }> {
    return savePlanToWorkspaceShared(this.store, this.planStore, sessionId, planId);
  }

  async createSession(opts: SessionCreateOptions): Promise<SessionHandle> {
    const preferred =
      opts.modelRef ??
      this.providerStore?.resolveEffectiveModelRef(null) ??
      undefined;
    const handle = this.store.create({
      ...opts,
      mode: opts.mode ?? this.config.mode,
      modelRef: preferred,
    });
    const opened = await this.openPiSession(handle);
    if (
      opened.appliedModelRef &&
      (!handle.modelRef ||
        handle.modelRef.providerId !== opened.appliedModelRef.providerId ||
        handle.modelRef.modelId !== opened.appliedModelRef.modelId)
    ) {
      this.store.updateModelRef(handle.id, opened.appliedModelRef);
      handle.modelRef = opened.appliedModelRef;
    }
    this.sessions.set(handle.id, {
      handle,
      piSession: opened.session,
      refs: opened.refs,
      appliedModelRef: opened.appliedModelRef,
      mcpActiveNames: opened.mcpActiveNames,
      toolRegister: opened.toolRegister,
      browserTaskExposed: this.isBrowserMcpReadyForSession(handle.id),
    });
    this.context.refresh(handle.id, {
      system: this.modeProfiles.systemPromptForMode(handle.mode),
      tools: this.toolNamesFor(handle.mode, opened.mcpActiveNames).join('\n'),
      mcp: opened.mcpContextText,
      conversation: '',
    });
    if (handle.mode === 'debug') {
      await this.startDebugSession(handle);
    }
    return handle;
  }

  getSession(sessionId: string): SessionHandle | undefined {
    return this.store.get(sessionId);
  }

  getContextUsage(sessionId: string): ContextUsageSnapshot | undefined {
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
      this.mcp.rebindWorkspace(workspace);
    }
  }

  async setMode(sessionId: string, mode: HarnessMode): Promise<SessionHandle | undefined> {
    const prev = this.store.get(sessionId);
    const updated = this.store.updateMode(sessionId, mode);
    const entry = this.sessions.get(sessionId);
    if (updated && entry) {
      const modeChanged = prev?.mode !== mode;
      entry.handle = updated;
      if (modeChanged) {
        if (prev?.mode === 'debug' && mode !== 'debug') {
          await this.stopDebugSession(sessionId, 'mode_left');
        }
        if (mode === 'debug') {
          await this.startDebugSession(updated);
        }
        entry.refs.modePrompt.current = this.modeProfiles.systemPromptForMode(mode);
        const mcpNames = entry.mcpActiveNames ?? [];
        const names = this.toolNamesFor(mode, mcpNames);
        entry.piSession.setActiveToolsByName(names);
        this.context.refresh(sessionId, {
          system: this.modeProfiles.systemPromptForMode(mode),
          tools: names.join('\n'),
          conversation: this.context.getConversation(sessionId),
          summarized: this.context.getSummarized(sessionId),
          toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(sessionId) ?? []),
        });
      }
    } else if (updated && mode === 'debug' && prev?.mode !== 'debug') {
      await this.startDebugSession(updated);
    } else if (updated && prev?.mode === 'debug' && mode !== 'debug') {
      await this.stopDebugSession(sessionId, 'mode_left');
    }
    return updated;
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
    state.info = {
      ...state.info,
      status: 'logs_ready',
      ingestRunning: true,
    };
    this.activePushes.get(sessionId)?.(
      makeEnvelope(
        'debug_logs_ready',
        {
          debugSessionId: state.info.debugSessionId,
          logPath: state.info.logPath,
          logPathRel: state.info.logPathRel,
          lineCount,
        },
        sessionId,
      ),
    );
    return state.info;
  }

  async markDebugFixed(sessionId: string): Promise<DebugSessionInfo> {
    const state = this.debugSessions.get(sessionId);
    if (!state?.handle) throw new Error('No active debug session');
    state.info = {
      ...state.info,
      ingestRunning: true,
    };
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

  private async startDebugSession(handle: SessionHandle): Promise<void> {
    const reuseId = this.reuseDebugSessionId(handle.id);
    const live = this.debugSessions.get(handle.id);
    if (live?.handle && live.info.ingestRunning && (!reuseId || live.info.debugSessionId === reuseId)) {
      return;
    }
    await this.stopDebugSession(handle.id, 'restart');
    try {
      const ingest = await startDebugIngestServer({
        workspace: handle.workspace,
        sessionShortId: reuseId,
      });
      const info: DebugSessionInfo = {
        debugSessionId: ingest.debugSessionId,
        ingestUrl: ingest.ingestUrl,
        logPath: ingest.logPath,
        logPathRel: ingest.logPathRel,
        status: 'ready',
        ingestRunning: true,
      };
      this.debugSessions.set(handle.id, { info, handle: ingest });
      if (!reuseId) {
        this.store.appendEvent(handle.id, {
          type: 'mode_change',
          mode: 'debug',
          debugSessionId: info.debugSessionId,
          logPathRel: info.logPathRel,
        });
      }
      this.activePushes.get(handle.id)?.(
        makeEnvelope(
          'debug_session_started',
          {
            debugSessionId: info.debugSessionId,
            ingestUrl: info.ingestUrl,
            logPath: info.logPath,
            logPathRel: info.logPathRel,
          },
          handle.id,
        ),
      );
    } catch (err) {
      const info: DebugSessionInfo = {
        debugSessionId: '',
        ingestUrl: '',
        logPath: '',
        logPathRel: '',
        status: 'failed',
        ingestRunning: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this.debugSessions.set(handle.id, { info, handle: null });
      this.activePushes.get(handle.id)?.(
        makeEnvelope(
          'error',
          {
            message: `Debug ingest failed to start: ${info.error}`,
            code: 'DEBUG_INGEST_FAILED',
          },
          handle.id,
        ),
      );
    }
  }

  private async stopDebugSession(sessionId: string, reason: string): Promise<void> {
    const state = this.debugSessions.get(sessionId);
    if (!state) return;
    if (state.handle) {
      try {
        await state.handle.close();
      } catch {
        // ignore close errors
      }
    }
    const info: DebugSessionInfo = {
      ...state.info,
      status: 'stopped',
      ingestRunning: false,
    };
    this.debugSessions.set(sessionId, { info, handle: null });
    this.activePushes.get(sessionId)?.(
      makeEnvelope(
        'debug_session_stopped',
        { debugSessionId: info.debugSessionId, reason },
        sessionId,
      ),
    );
  }

  async setModelRef(
    sessionId: string,
    modelRef: ModelRef | undefined,
  ): Promise<SessionHandle | undefined> {
    const effective =
      modelRef && this.providerStore
        ? this.providerStore.resolveEffectiveModelRef(modelRef) ?? modelRef
        : modelRef;
    let updated = this.store.updateModelRef(sessionId, effective);
    const entry = this.sessions.get(sessionId);
    if (updated && entry) {
      entry.handle = updated;
      if (this.providerStore && effective) {
        try {
          const modelRuntime = await this.getModelRuntime();
          const contextWindow = this.effectiveContextFor(updated);
          const resolved = await resolvePiModel(
            modelRuntime,
            this.providerStore,
            effective,
            { contextWindow },
          );
          if (resolved) {
            await entry.piSession.setModel(resolved.model);
            entry.appliedModelRef = resolved.modelRef;
            if (updated.thinkingLevel) {
              entry.piSession.setThinkingLevel(updated.thinkingLevel);
            }
            if (
              updated.modelRef?.providerId !== resolved.modelRef.providerId ||
              updated.modelRef?.modelId !== resolved.modelRef.modelId
            ) {
              updated = this.store.updateModelRef(sessionId, resolved.modelRef) ?? updated;
            }
          } else {
            entry.appliedModelRef = undefined;
          }
        } catch (err) {
          entry.appliedModelRef = undefined;
          console.warn(
            '[pi-runtime] setModelRef failed:',
            err instanceof Error ? err.message : err,
          );
        }
      } else {
        entry.appliedModelRef = undefined;
      }
      this.syncSessionContextLimit(updated);
    }
    return updated;
  }

  async setThinkingLevel(
    sessionId: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<SessionHandle | undefined> {
    const level = toMenuThinkingLevel(thinkingLevel);
    const updated = this.store.updateThinkingLevel(sessionId, level);
    const entry = this.sessions.get(sessionId);
    if (updated && entry) {
      entry.handle = updated;
      entry.piSession.setThinkingLevel(level);
    }
    return updated;
  }

  async setMaxMode(sessionId: string, maxMode: boolean): Promise<SessionHandle | undefined> {
    const updated = this.store.updateMaxMode(sessionId, maxMode);
    const entry = this.sessions.get(sessionId);
    if (updated && entry) {
      entry.handle = updated;
      this.syncSessionContextLimit(updated);
      if (this.providerStore && updated.modelRef) {
        try {
          const modelRuntime = await this.getModelRuntime();
          const contextWindow = this.effectiveContextFor(updated);
          const resolved = await resolvePiModel(
            modelRuntime,
            this.providerStore,
            updated.modelRef,
            { contextWindow },
          );
          if (resolved) {
            await entry.piSession.setModel(resolved.model);
            entry.appliedModelRef = resolved.modelRef;
          }
        } catch (err) {
          console.warn(
            '[pi-runtime] setMaxMode rebind failed:',
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
    return updated;
  }

  private effectiveContextFor(handle: SessionHandle): number {
    const creds =
      handle.modelRef && this.providerStore
        ? this.providerStore.resolveCredentials(handle.modelRef)
        : null;
    return resolveEffectiveContextLimit({
      maxMode: handle.maxMode,
      apiMaxContext: creds?.model.apiMaxContext,
      contextLimit: creds?.model.contextLimit,
      modelId: handle.modelRef?.modelId ?? creds?.model.id,
      fallbackLimit: this.config.modelContextLimit,
    });
  }

  private syncSessionContextLimit(handle: SessionHandle): void {
    const limit = this.effectiveContextFor(handle);
    this.context.setSessionLimit(handle.id, limit);
    // 必须带上 toolPayloadTokens，否则会把 resume/换模后的 conversation 桶侧车清成 0，
    // 出现「角标仍是压缩前比例、打开面板又变成很低」的不一致。
    this.context.refresh(handle.id, {
      system: this.modeProfiles.systemPromptForMode(handle.mode),
      tools: this.toolNamesFor(
        handle.mode,
        this.sessions.get(handle.id)?.mcpActiveNames ?? [],
      ).join('\n'),
      conversation: this.context.getConversation(handle.id),
      summarized: this.context.getSummarized(handle.id),
      toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(handle.id) ?? []),
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.permissions.rejectAll(sessionId);
    this.modeSuggests.rejectAll(sessionId);
    this.questionsBroker.rejectAll(sessionId);
    await this.stopDebugSession(sessionId, 'session_deleted');
    this.debugSessions.delete(sessionId);
    try {
      this.subagents.disposeParent(sessionId, this.sessionDir(sessionId));
    } catch {
      this.subagents.abortAllForParent(sessionId, 'parent_deleted');
    }
    const entry = this.sessions.get(sessionId);
    if (entry) {
      await entry.piSession.abort?.();
      disposePiSession(entry.piSession);
      this.sessions.delete(sessionId);
    }
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
    const handle =
      this.store.get(sessionId) ?? this.sessions.get(sessionId)?.handle;
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
    const updated = this.store.updateTitle(sessionId, title);
    const entry = this.sessions.get(sessionId);
    if (updated && entry) entry.handle = updated;
    return updated;
  }

  async rewindSession(
    sessionId: string,
    beforeMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    return this.truncateAndRebuildPi(sessionId, beforeMessageId, 'rewind');
  }

  async prepareFork(
    sessionId: string,
    fromMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    return this.truncateAndRebuildPi(sessionId, fromMessageId, 'fork');
  }

  async forkChatSession(
    srcSessionId: string,
    throughMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    const { session: handle, messages } = await forkChatSessionShared({
      store: this.store,
      context: this.context,
      toolResults: this.toolResults,
      srcSessionId,
      throughMessageId,
      modeProfiles: this.modeProfiles,
      inMemoryHandle: this.sessions.get(srcSessionId)?.handle,
      createSession: (options) => this.createSession(options),
      setSessionTitle: (sessionId, title) => this.setSessionTitle(sessionId, title),
    });

    const existing = this.sessions.get(handle.id);
    if (existing) {
      await existing.piSession.abort?.();
      disposePiSession(existing.piSession);
      this.sessions.delete(handle.id);
    }

    const history = piHistoryAfterAccountingRebuild(
      {
        store: this.store,
        context: this.context,
        sessionDir: (id) => this.sessionDir(id),
      },
      handle.id,
      messages,
    );
    const piOpened = await this.openPiSession(handle, history);
    this.sessions.set(handle.id, {
      handle,
      piSession: piOpened.session,
      refs: piOpened.refs,
      appliedModelRef: piOpened.appliedModelRef,
      mcpActiveNames: piOpened.mcpActiveNames,
      toolRegister: piOpened.toolRegister,
      browserTaskExposed: this.isBrowserMcpReadyForSession(handle.id),
    });

    return { session: handle, messages };
  }

  private async truncateAndRebuildPi(
    sessionId: string,
    messageId: string,
    kind: 'rewind' | 'fork',
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }> {
    const { session: handle, messages } = truncateSessionHistoryShared({
      store: this.store,
      context: this.context,
      toolResults: this.toolResults,
      busySessions: this.busySessions,
      sessionId,
      messageId,
      kind,
      modeProfiles: this.modeProfiles,
      inMemoryHandle: this.sessions.get(sessionId)?.handle,
    });

    const existing = this.sessions.get(sessionId);
    if (existing) {
      await existing.piSession.abort?.();
      disposePiSession(existing.piSession);
      this.sessions.delete(sessionId);
    }

    const history = piHistoryAfterAccountingRebuild(
      {
        store: this.store,
        context: this.context,
        sessionDir: (id) => this.sessionDir(id),
      },
      sessionId,
      messages,
    );
    const piOpened = await this.openPiSession(handle, history);
    this.sessions.set(sessionId, {
      handle,
      piSession: piOpened.session,
      refs: piOpened.refs,
      appliedModelRef: piOpened.appliedModelRef,
      mcpActiveNames: piOpened.mcpActiveNames,
      toolRegister: piOpened.toolRegister,
      browserTaskExposed: this.isBrowserMcpReadyForSession(sessionId),
    });

    return { session: handle, messages };
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

  async resolveModeSuggest(suggestId: string, decision: 'switch' | 'skip'): Promise<boolean> {
    return resolveModeSuggestShared(this.modeSuggests, suggestId, decision);
  }

  async resolvePlanQuestion(
    questionId: string,
    body: import('@ciro-code/harness-shared').PlanQuestionResolveBody,
  ): Promise<boolean> {
    return resolvePlanQuestionShared(this.questionsBroker, questionId, body);
  }

  listAudit(opts?: { sessionId?: string; limit?: number }) {
    return listAuditShared(this.audit, opts);
  }

  async *sendMessage(
    sessionId: string,
    message: UserMessage,
    ctx: TurnContext,
  ): AsyncIterable<SseEnvelope> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      yield makeEnvelope('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' }, sessionId);
      return;
    }

    if (this.busySessions.has(sessionId)) {
      throw new Error('SESSION_BUSY: Session is streaming');
    }

    if (ctx.mode !== entry.handle.mode) {
      await this.setMode(sessionId, ctx.mode);
    }
    if (ctx.mode === 'debug' && !this.debugSessions.get(sessionId)) {
      const live = this.sessions.get(sessionId);
      if (live) await this.startDebugSession(live.handle);
    }
    if (ctx.mode === 'debug') {
      const dbg = this.debugSessions.get(sessionId);
      if (dbg) {
        const hitl = debugHitlUnlockFromUserText(message.message);
        if (hitl.analyzeUnlocked) dbg.analyzeUnlocked = true;
        if (hitl.cleanupUnlocked) dbg.cleanupUnlocked = true;
      }
    }

    if (this.providerStore) {
      const preferred = entry.handle.modelRef ?? null;
      const effective = this.providerStore.resolveEffectiveModelRef(preferred);
      if (!effective) {
        yield makeEnvelope(
          'error',
          {
            message:
              '未配置可用模型或 API Key。请打开「模型设置」添加 Provider 与密钥，或设置 DEEPSEEK_API_KEY / OPENAI_API_KEY 后重启，也可使用 --mock。',
            code: 'MODEL_NOT_CONFIGURED',
          },
          sessionId,
        );
        return;
      }
      const same =
        entry.appliedModelRef?.providerId === effective.providerId &&
        entry.appliedModelRef?.modelId === effective.modelId;
      if (!same) {
        await this.setModelRef(sessionId, effective);
      }
      const applied = this.sessions.get(sessionId)?.appliedModelRef;
      if (
        applied?.providerId !== effective.providerId ||
        applied?.modelId !== effective.modelId
      ) {
        yield makeEnvelope(
          'error',
          {
            message:
              '无法将所选模型应用到运行时（API Key 未注入）。请打开模型设置检查，或重启 ciro web。',
            code: 'MODEL_APPLY_FAILED',
          },
          sessionId,
        );
        return;
      }
    }

    const userMessageId =
      typeof message.messageId === 'string' && message.messageId.trim()
        ? message.messageId.trim()
        : randomUUID();

    let validatedImages: ReturnType<typeof validateChatImages> = [];
    let imageRefs: ReturnType<typeof persistChatImages> = [];
    try {
      validatedImages = validateChatImages(message.images);
      if (validatedImages.length > 0) {
        const preferred =
          this.sessions.get(sessionId)?.appliedModelRef ??
          this.sessions.get(sessionId)?.handle.modelRef ??
          null;
        const effective = this.providerStore?.resolveEffectiveModelRef(preferred) ?? null;
        const creds =
          effective && this.providerStore
            ? this.providerStore.resolveCredentials(effective)
            : null;
        if (!creds?.model.supportsVision) {
          yield makeEnvelope(
            'error',
            {
              message:
                '当前模型未开启 Vision，无法发送图片。请在模型设置中启用，或切换支持多模态的模型。',
              code: 'VISION_NOT_SUPPORTED',
            },
            sessionId,
          );
          return;
        }
        imageRefs = persistChatImages(this.sessionDir(sessionId), userMessageId, validatedImages);
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

    const assistantMessageId = randomUUID();
    const messageId = userMessageId;
    const hub = createTurnHub();
    const push = hub.push;
    let done = false;
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

    // subscribe 并行 yield；模型经 SuggestMode 工具同步挂起
    void (async () => {
      let turnMode = ctx.mode;

      let currentEntry = this.sessions.get(sessionId);
      if (!currentEntry || done) {
        if (!done) {
          done = true;
          hub.finish();
        }
        this.clearActiveTurn(sessionId);
        return;
      }

      let assistantText = '';
      let assistantFlushedLen = 0;
      let thinkingText = '';
      let thinkingStartedAt: number | null = null;
      let liveUsage: LiveContextUsageEmitter | null = null;
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
      const markComplete = () => {
        if (done) return;
        push(makeEnvelope('complete', { messageId }, sessionId, messageId));
        done = true;
        hub.finish();
      };

      const unsubscribe = currentEntry.piSession.subscribe((event) => {
        switch (event.type) {
          case 'message_update':
            if (event.assistantMessageEvent.type === 'text_delta') {
              flushThinkingSegment();
              assistantText += event.assistantMessageEvent.delta;
              push(
                makeEnvelope(
                  'token',
                  { delta: event.assistantMessageEvent.delta },
                  sessionId,
                  messageId,
                ),
              );
              liveUsage?.schedule();
            } else if (event.assistantMessageEvent.type === 'thinking_delta') {
              if (thinkingStartedAt == null) thinkingStartedAt = Date.now();
              thinkingText += event.assistantMessageEvent.delta;
              push(
                makeEnvelope(
                  'thinking',
                  { delta: event.assistantMessageEvent.delta },
                  sessionId,
                  messageId,
                ),
              );
            }
            break;
          case 'tool_execution_start': {
            flushThinkingSegment();
            flushAssistantSegment();
            const toolCallId = event.toolCallId ?? randomUUID();
            this.store.appendEvent(sessionId, {
              type: 'tool_call',
              toolCallId,
              toolName: event.toolName,
              toolInput: event.args as Record<string, unknown> | undefined,
            });
            push(
              makeEnvelope(
                'tool_call_start',
                {
                  toolCallId,
                  toolName: event.toolName,
                  toolInput: event.args as Record<string, unknown> | undefined,
                },
                sessionId,
                messageId,
              ),
            );
            liveUsage?.schedule();
            break;
          }
          case 'tool_execution_end': {
            const toolCallId = event.toolCallId ?? randomUUID();
            const preview = previewFromToolResult(event.result);
            const isError = toolResultIsError(event);
            this.trackToolResult(sessionId, toolCallId, event.toolName, preview);
            this.store.appendEvent(sessionId, {
              type: 'tool_result',
              toolCallId,
              toolName: event.toolName,
              isError,
            });
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
                  toolName: event.toolName,
                  resultPreview: clipToolPreview(preview, event.toolName),
                  isError,
                },
                sessionId,
                messageId,
              ),
            );
            // 工具结果主导上下文增长；立即刷新（对齐 Cursor 上下文环）
            liveUsage?.flush();
            break;
          }
          case 'agent_settled':
            break;
        }
      });

      const baseSystemRaw = this.modeProfiles.systemPromptForMode(turnMode);
      currentEntry.refs.modePrompt.current = baseSystemRaw;
      const dbg = this.debugSessions.get(sessionId);
      currentEntry.refs.debugInfo.current =
        turnMode === 'debug' && dbg
          ? {
              debugSessionId: dbg.info.debugSessionId,
              ingestUrl: dbg.info.ingestUrl,
              logPathRel: dbg.info.logPathRel,
              failed: dbg.info.status === 'failed',
              analyzeUnlocked: dbg.analyzeUnlocked,
              cleanupUnlocked: dbg.cleanupUnlocked,
            }
          : null;
      const modeSystem =
        currentEntry.refs.debugInfo.current
          ? injectDebugReminder(baseSystemRaw, currentEntry.refs.debugInfo.current)
          : baseSystemRaw;
      if (message.enabledMcp) {
        this.mcp.setSessionEnabled(sessionId, message.enabledMcp);
      }
      const mcpEnabled = this.mcp.getSessionEnabled(sessionId);
      const enabledMcpIds = new Set(mcpEnabled);

      const { mem, rulesAdv, skillAdv } = assembleAndPushInjections({
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
      await this.mcp.ensureConnected(mcpEnabled);
      await this.extensionHost?.ensureLoaded();
      const gate = this.gateFor(sessionId);
      this.syncTaskToolBrowserGate(sessionId, gate);
      const mcpDefs = buildMcpTools(this.mcp, mcpEnabled, gate);
      const extDefs = buildExtensionTools(this.extensionHost, gate);
      const known = new Set(currentEntry.piSession.getAllTools().map((t) => t.name));
      registerMissingMcpTools(mcpDefs, known, currentEntry.toolRegister.registerTool);
      for (const t of mcpDefs) known.add(t.name);
      registerMissingExtTools(extDefs, known, currentEntry.toolRegister.registerTool);
      const mcpNames = mcpToolNames(this.mcp, mcpEnabled);
      const mcpText = mcpToolsContextText(this.mcp, mcpEnabled);
      currentEntry.mcpActiveNames = mcpNames;
      const activeNames = this.toolNamesFor(turnMode, mcpNames);
      currentEntry.piSession.setActiveToolsByName(activeNames);
      const errors = mcpConnectionErrors(this.mcp, mcpEnabled);
      push(
        makeEnvelope(
          'mcp_tools_changed',
          {
            sessionId,
            enabled: mcpEnabled,
            toolNames: mcpNames,
            tokenEstimate: this.mcp.estimateToolsTokens(mcpEnabled),
            ...(Object.keys(errors).length > 0 ? { errors } : {}),
          },
          sessionId,
          messageId,
        ),
      );

      const extras = [
        rulesAdv.injection,
        mem.injection,
        skillAdv.injection,
        currentEntry.confirmedPlanMarkdown,
      ]
        .filter(Boolean)
        .join('\n\n');
      currentEntry.refs.turnExtras.current = extras;
      const systemWithExtras = extras ? `${modeSystem}\n\n${extras}` : modeSystem;

      this.context.appendConversation(sessionId, `\nUser: ${message.message}`);
      const staticParts = () => ({
        system: systemWithExtras,
        tools: activeNames.join('\n'),
        memory: mem.injection,
        rules: rulesAdv.injection,
        skills: skillAdv.injection,
        mcp: mcpText,
        subagents: this.context.getSubagents(sessionId),
        summarized: this.context.getSummarized(sessionId),
        toolPayloadTokens: sumToolPayloadTokens(this.toolResults.get(sessionId) ?? []),
      });
      const snapshot = this.context.refresh(sessionId, staticParts());
      this.store.appendEvent(sessionId, {
        type: 'message',
        role: 'system',
        tokenEstimate: snapshot.totalTokens,
      });
      push(makeEnvelope('context_usage', snapshot, sessionId, messageId));

      liveUsage = createLiveContextUsageEmitter({
        context: this.context,
        sessionId,
        getStaticParts: staticParts,
        getInFlightAssistantText: () => assistantText,
        onSnapshot: (snap) => {
          push(makeEnvelope('context_usage', snap, sessionId, messageId));
        },
      });

      try {
        await currentEntry.piSession.prompt(message.message, {
          images: validatedImages.length ? validatedImages : undefined,
        });
        await currentEntry.piSession.agent.waitForIdle();
        await this.finishBackgroundTasksInTurn(sessionId, currentEntry);
        this.compaction.noteTurn(ctx.workspace, {
          userMessage: message.message,
          toolNames: (this.toolResults.get(sessionId) ?? []).slice(-8).map((t) => t.toolName),
        });

        // 先落盘本轮助手文本/事件，再 compact，避免重建 Pi 时丢掉刚完成的回合
        flushThinkingSegment();
        flushAssistantSegment();
        this.store.appendEvent(sessionId, {
          type: 'turn_complete',
          messageId: assistantMessageId,
          workedMs: Math.max(0, Date.now() - turnStartedAt),
        });
        liveUsage?.dispose();
        liveUsage = null;
        if (assistantText) {
          this.context.appendConversation(sessionId, `\nAssistant: ${assistantText}`);
        }

        // 回合内 tool payload 已写入 Map；刷新后再决定 auto-compact
        const postTurnSnap = this.context.refresh(sessionId, staticParts());
        push(makeEnvelope('context_usage', postTurnSnap, sessionId, messageId));

        await emitAutoCompaction({
          push,
          compaction: this.compaction,
          context: this.context,
          sessionId,
          messageId,
          fallbackSnapshot: postTurnSnap,
          compactionBias: this.modeProfiles.getModeProfile(ctx.mode).compactionBias,
          compactSession: (id, o) => this.compactSession(id, o),
        });
        const rebuilt = this.sessions.get(sessionId);
        if (rebuilt) currentEntry = rebuilt;

        markComplete();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        push(
          makeEnvelope(
            'error',
            { message: error.message, code: 'PROMPT_ERROR' },
            sessionId,
            messageId,
          ),
        );
        done = true;
        hub.finish();
      } finally {
        liveUsage?.dispose();
        liveUsage = null;
        try {
          unsubscribe();
        } catch {
          /* Pi 可能已在 compact rebuild 中 dispose */
        }
        const live = this.sessions.get(sessionId) ?? currentEntry;
        live.refs.turnExtras.current = '';
        live.refs.debugInfo.current = null;
        const dbg = this.debugSessions.get(sessionId);
        if (dbg) {
          dbg.analyzeUnlocked = false;
          dbg.cleanupUnlocked = false;
        }
        this.clearActiveTurn(sessionId);
      }
    })();

    try {
      yield* hub.subscribe(0);
    } catch {
      // HTTP 断连取消订阅时不 abort turn；busy 由 runPrompt.finally 清理
    }
  }

  async steerInFlight(
    sessionId: string,
    message: UserMessage,
  ): Promise<{ messageId: string }> {
    const entry = this.sessions.get(sessionId);
    if (!entry || !this.busySessions.has(sessionId)) {
      throw new Error('SESSION_IDLE: Session is not streaming');
    }

    const userMessageId =
      typeof message.messageId === 'string' && message.messageId.trim()
        ? message.messageId.trim()
        : randomUUID();

    const validatedImages = validateChatImages(message.images);
    let imageRefs: ReturnType<typeof persistChatImages> = [];
    if (validatedImages.length > 0) {
      const preferred = entry.appliedModelRef ?? entry.handle.modelRef ?? null;
      const effective = this.providerStore?.resolveEffectiveModelRef(preferred) ?? null;
      const creds =
        effective && this.providerStore
          ? this.providerStore.resolveCredentials(effective)
          : null;
      if (!creds?.model.supportsVision) {
        throw new ChatImageValidationError(
          '当前模型未开启 Vision，无法发送图片。请在模型设置中启用，或切换支持多模态的模型。',
        );
      }
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

    const content =
      validatedImages.length === 0
        ? message.message
        : [{ type: 'text' as const, text: message.message }, ...validatedImages];
    await entry.piSession.sendUserMessage(content, { deliverAs });
    return { messageId: userMessageId };
  }

  async abort(sessionId: string): Promise<void> {
    this.permissions.rejectAll(sessionId);
    this.modeSuggests.rejectAll(sessionId);
    this.questionsBroker.rejectAll(sessionId);
    this.pendingBackgroundResults.delete(sessionId);
    this.turnBackgroundTasks.delete(sessionId);
    this.subagents.abortAllForParent(sessionId, 'parent_abort');
    const entry = this.sessions.get(sessionId);
    if (entry) {
      try {
        entry.piSession.clearQueue();
      } catch {
        /* ignore */
      }
      try {
        await entry.piSession.abort?.();
      } finally {
        // abort 后若 prompt 未进入 finally，避免 busy 残留导致后续 fork/rewind 409 + UI 卡「…」
        this.clearActiveTurn(sessionId);
      }
    } else {
      this.clearActiveTurn(sessionId);
    }
  }

  getAvailableTools(filter?: ToolFilter): ToolDefinition[] {
    return availableToolsShared(
      this.config,
      filter,
      (name) => `${name} workspace tool`,
      this.modeProfiles,
    );
  }
}
