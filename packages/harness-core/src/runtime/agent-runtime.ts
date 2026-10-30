import type {
  AuditEntry,
  CompactionMethod,
  CompactionResult,
  ContextUsageSnapshot,
  DebugSessionInfo,
  HarnessMode,
  ModelRef,
  PlanRecord,
  PlanSummary,
  PlanQuestionResolveBody,
  SessionCreateOptions,
  SessionHandle,
  SseEnvelope,
  ThinkingLevel,
  ToolDefinition,
  ToolFilter,
  TurnContext,
  UserMessage,
  FileChangeRecord,
  SubagentRunMeta,
  ModeProfileProvider,
} from '@ciro-code/harness-shared';
import type { SessionStore } from '../session/session-store.js';
import type { AuditLog } from '../audit/audit-log.js';
import type { PermissionBroker } from '../permission/permission-broker.js';
import type { ShellAllowlistStore } from '../permission/shell-allowlist-store.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ContextAccountant } from '../context/context-accountant.js';
import type { ProviderStore } from '../providers/provider-store.js';
import type { McpManager } from '../mcp/mcp-manager.js';
import type { ExtensionHost } from '../extensions/extension-host.js';

export interface CompactSessionOptions {
  method?: CompactionMethod;
  /**
   * 回合末 auto-compact 在 clearActiveTurn 之前调用，需放行 busy。
   * 手动 compact（HTTP/UI）勿传；busy 时与 rewind 一样拒绝。
   */
  allowBusy?: boolean;
}

export interface SubagentRunView {
  meta: SubagentRunMeta;
  events: Record<string, unknown>[];
}

/** 稳定内部契约；Pi / Mock adapter 实现 */
export interface AgentRuntime {
  createSession(opts: SessionCreateOptions): Promise<SessionHandle>;
  getSession(sessionId: string): SessionHandle | undefined;
  setMode(sessionId: string, mode: HarnessMode): Promise<SessionHandle | undefined>;
  setModelRef(
    sessionId: string,
    modelRef: ModelRef | undefined,
  ): Promise<SessionHandle | undefined>;
  setThinkingLevel(
    sessionId: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<SessionHandle | undefined>;
  setMaxMode(sessionId: string, maxMode: boolean): Promise<SessionHandle | undefined>;
  deleteSession(sessionId: string): Promise<boolean>;
  /** 该 session 是否正在 sendMessage（C4c 忙锁；C4d 复用） */
  isSessionBusy(sessionId: string): boolean;
  /**
   * C4d-S3：附着到进行中的 turn（快照 + 缓冲重放 + live）。
   * 非 busy → 抛 SESSION_IDLE。
   * O3：opts.fromSeq 有值时从该下标重放；仅当 fromSeq 缺省或 0 时发完整 attach_snapshot。
   */
  attachMessage(
    sessionId: string,
    opts?: { fromSeq?: number },
  ): AsyncIterable<SseEnvelope>;
  /** O3：workspace 级 session_busy / session_idle 控制面 */
  subscribeSessionActivity(): AsyncIterable<SseEnvelope>;
  /** 丢弃 beforeMessageId 该 user 轮及之后；不自动发消息 */
  rewindSession(
    sessionId: string,
    beforeMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }>;
  /** 截断到 fromMessageId 之前并重建 Pi；调用方再 sendMessage */
  prepareFork(
    sessionId: string,
    fromMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }>;
  /**
   * C4e：新建会话并克隆源至 throughMessageId（含）；原会话不动。
   * 源 busy 时仍允许只读 clone。
   */
  forkChatSession(
    srcSessionId: string,
    throughMessageId: string,
  ): Promise<{
    session: SessionHandle;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  }>;
  setSessionTitle(
    sessionId: string,
    title: string | undefined,
  ): Promise<SessionHandle | undefined>;
  sendMessage(
    sessionId: string,
    message: UserMessage,
    ctx: TurnContext,
  ): AsyncIterable<SseEnvelope>;
  /**
   * 忙态注入引导（Pi deliverAs: steer | followUp；默认 steer）。非 busy 抛 SESSION_IDLE。
   * 不开启第二路 sendMessage / SSE。JSONL 带 deliverAs 供 resume 嵌时间线。
   */
  steerInFlight(
    sessionId: string,
    message: UserMessage,
  ): Promise<{ messageId: string }>;
  abort(sessionId: string): Promise<void>;
  getAvailableTools(filter?: ToolFilter): ToolDefinition[];
  resolvePermission(
    permissionId: string,
    decision: 'allow' | 'deny',
    options?: { remember?: boolean },
  ): Promise<boolean>;
  resolveModeSuggest(suggestId: string, decision: 'switch' | 'skip'): Promise<boolean>;
  resolvePlanQuestion(questionId: string, body: PlanQuestionResolveBody): Promise<boolean>;
  listAudit(opts?: { sessionId?: string; limit?: number }): AuditEntry[];
  getContextUsage(sessionId: string): ContextUsageSnapshot | undefined;
  compactSession(
    sessionId: string,
    opts?: CompactSessionOptions,
  ): Promise<{ result: CompactionResult; contextUsage?: ContextUsageSnapshot }>;
  resumeSession(sessionId: string): Promise<{
    session: SessionHandle;
    messageCount: number;
    eventsReplayed: number;
    stoppedAtBoundary: boolean;
    contextUsage?: ContextUsageSnapshot;
    messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
    /** 该 session 最近已确认计划；供 resume 时间线标 confirmed */
    confirmedPlanId?: string;
  }>;
  rebindWorkspace(
    workspace: string,
    opts?: { memoryStore?: MemoryStore; mcpManager?: McpManager; skillRegistry?: SkillRegistry },
  ): void;
  listPlans(sessionId: string): PlanSummary[];
  getPlan(sessionId: string, planId: string): PlanRecord | undefined;
  confirmPlan(
    sessionId: string,
    planId: string,
  ): Promise<{ session: SessionHandle; plan: PlanRecord }>;
  /** 复制计划到 workspace/.ciro/plans/ */
  savePlanToWorkspace(
    sessionId: string,
    planId: string,
  ): Promise<{ pathRel: string; plan: PlanRecord }>;
  /** Sprint 3.2 Debug */
  getDebugSession(sessionId: string): DebugSessionInfo | undefined;
  proceedDebug(sessionId: string): Promise<DebugSessionInfo>;
  markDebugFixed(sessionId: string): Promise<DebugSessionInfo>;
  listFileChanges(sessionId: string): FileChangeRecord[];
  /** 接受会话变更：确认保留 after，disposition 持久化 */
  acceptFileChange(sessionId: string, path: string): FileChangeRecord;
  /** 拒绝会话变更：还原 baseline / 删除新建，disposition 持久化 */
  rejectFileChange(sessionId: string, path: string): FileChangeRecord;
  /** Phase 4.3：abort 隐藏子运行 */
  abortSubagent(parentSessionId: string, taskId: string): Promise<boolean>;
  listSubagents(parentSessionId: string): SubagentRunMeta[];
  getSubagent(parentSessionId: string, taskId: string): SubagentRunView | null;
  clearSubagents(parentSessionId: string): void;
  /** 4.3b：子 Tab SSE — replay + live events */
  streamSubagentEvents(
    parentSessionId: string,
    taskId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>>;
}


export interface CreateRuntimeOptions {
  sessionStore?: SessionStore;
  auditLog?: AuditLog;
  permissionBroker?: PermissionBroker;
  /** Shell 命令白名单（与设置页 / resolve remember 共用） */
  shellAllowlist?: ShellAllowlistStore;
  memoryStore?: MemoryStore;
  contextAccountant?: ContextAccountant;
  /** Phase 3：本地 Provider / Key，供 runtime 按 modelRef 选模 */
  providerStore?: ProviderStore;
  /** Phase 4.2：MCP 管理器（安装 / 连接 / 本轮启用） */
  mcpManager?: McpManager;
  /** §9.2 Extension Host（Trust 后加载） */
  extensionHost?: ExtensionHost;
  /** Skills 发现表（须与设置页 GET /api/v1/skills 共用，否则刷新不进对话注入） */
  skillRegistry?: SkillRegistry;
  /** 四模式 Profile 端口（CLI 注入产品 Profile；缺省由 harness-pi 使用 minimal stub） */
  modeProfiles?: ModeProfileProvider;
  /**
   * O3：session busy/idle 通知钩子（web 注入共享 hub；缺省 runtime 自建）。
   * 形状与 harness-pi `SessionActivityHub` 对齐，core 不依赖 pi 包。
   */
  sessionActivity?: {
    notifyBusy: (sessionId: string) => void;
    notifyIdle: (sessionId: string) => void;
    subscribe: () => AsyncIterable<SseEnvelope>;
  };
}
