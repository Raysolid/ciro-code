import type {
  ContextBucketId,
  ContextUrgency,
  HarnessMode,
  ModelRef,
  PermissionPreset,
  ThinkingLevel,
} from './primitives.js';

export interface SessionCreateOptions {
  workspace: string;
  mode?: HarnessMode;
  sessionId?: string;
  modelRef?: ModelRef;
}

export interface SessionHandle {
  id: string;
  workspace: string;
  mode: HarnessMode;
  createdAt: number;
  modelRef?: ModelRef;
  /** 侧栏展示名；缺省时 UI 用 Session {shortId} */
  title?: string;
  /** 本会话思考档；仅 supportsThinking 模型有意义 */
  thinkingLevel?: ThinkingLevel;
  /** Max 模式；可任意开关，仅当模型有 apiMaxContext 时才改变有效上限 */
  maxMode?: boolean;
}

/** 对齐 Pi RPC ImageContent：base64 data + mimeType */
export interface ChatImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/** events.jsonl / resume 用的磁盘附件引用（相对 sessionDir） */
export interface ChatImageAttachmentRef {
  path: string;
  mimeType: string;
}

/**
 * 忙态注入投递方式（Pi sendUserMessage；写入 JSONL 供 resume 嵌时间线）。
 * UI 默认发 steer；followUp 为 API 预留，Composer 尚未暴露。
 */
export type InFlightDeliverAs = 'steer' | 'followUp';

export interface UserMessage {
  message: string;
  /** 客户端生成的 user messageId；缺省由服务端分配。须与 events.jsonl / fork·rewind 一致 */
  messageId?: string;
  /** 多模态图片（仅 supportsVision 模型）；服务端校验后落盘 */
  images?: ChatImageContent[];
  /** Phase 4.2：本轮覆盖启用的 MCP server id */
  enabledMcp?: string[];
  /** 忙态注入：steer 打断当前步；followUp 排到本轮末（UI 默认 steer） */
  deliverAs?: InFlightDeliverAs;
}

export interface TurnContext {
  sessionId: string;
  mode: HarnessMode;
  workspace: string;
}

export interface ToolFilter {
  mode?: HarnessMode;
  allowed?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Phase 0–3 SSE 事件类型 */
export type HarnessSseEventType =
  | 'token'
  | 'thinking'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'complete'
  | 'error'
  | 'mode_changed'
  | 'model_changed'
  | 'permission_request'
  | 'permission_resolved'
  | 'context_usage'
  | 'memory_injected'
  | 'skill_activated'
  | 'rules_injected'
  | 'mcp_tools_changed'
  | 'ui_notify'
  | 'compaction_suggested'
  | 'compaction_progress'
  | 'compaction_completed'
  | 'session_recovered'
  | 'attach_snapshot'
  | 'providers_updated'
  | 'plan_question'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_confirmed'
  | 'debug_session_started'
  | 'debug_waiting_repro'
  | 'debug_logs_ready'
  | 'debug_session_stopped'
  | 'mode_suggested'
  | 'file_changed'
  | 'session_busy'
  | 'session_idle'
  | 'subagent_start'
  | 'subagent_progress'
  | 'subagent_completed';

export type DebugSessionStatus =
  | 'starting'
  | 'ready'
  | 'waiting_repro'
  | 'logs_ready'
  | 'stopped'
  | 'failed';

export interface DebugSessionInfo {
  debugSessionId: string;
  ingestUrl: string;
  logPath: string;
  /** workspace-relative log path for tools / UI */
  logPathRel: string;
  status: DebugSessionStatus;
  /** ingest 服务是否在跑 */
  ingestRunning: boolean;
  error?: string;
}

export interface DebugSessionStartedPayload {
  debugSessionId: string;
  ingestUrl: string;
  logPath: string;
  logPathRel: string;
}

export interface DebugWaitingReproPayload {
  debugSessionId: string;
  steps?: string[];
}

export interface DebugLogsReadyPayload {
  debugSessionId: string;
  logPath: string;
  logPathRel: string;
  lineCount: number;
}

export interface DebugSessionStoppedPayload {
  debugSessionId: string;
  reason?: string;
}

export interface ModeSuggestedPayload {
  /** 同步门闩 id；UI resolve 时回传 */
  suggestId: string;
  suggestedMode: HarnessMode;
  currentMode: HarnessMode;
  reason: string;
}

/** 与 UI 倒计时对齐；超时视为 skip */
export const MODE_SUGGEST_TIMEOUT_MS = 12_000;

export type FileEditOperation = 'write' | 'edit';

/** 会话变更审阅状态（跟 session，非 Git） */
export type ChangeDisposition = 'pending' | 'accepted' | 'rejected';

/** write/edit 成功后的变更记录（SSE / REST / events.jsonl） */
export interface FileChangeRecord {
  path: string;
  operation: FileEditOperation;
  summary: string;
  /** unified diff；过大时已截断 */
  unifiedDiff: string;
  ts: number;
  toolCallId?: string;
  truncated?: boolean;
  /** 服务端审阅状态；缺省视为 pending */
  disposition?: ChangeDisposition;
  /** false：无 baseline 快照（旧会话），reject 会失败 */
  reviewable?: boolean;
}

export interface FileChangedPayload extends FileChangeRecord {}

export interface PlanQuestionOption {
  id: string;
  label: string;
}

export interface PlanQuestionItem {
  id: string;
  prompt: string;
  options?: PlanQuestionOption[];
  allowMultiple?: boolean;
}

export interface PlanQuestionAnswer {
  questionId: string;
  optionIds?: string[];
  customText?: string;
  /** 提交时写入的展示文案，历史卡优先用它回显 */
  label?: string;
}

export interface PlanQuestionPayload {
  /** 同步门闩 id；UI resolve 时回传 */
  questionId: string;
  questions: PlanQuestionItem[];
}

export interface PlanQuestionResolveBody {
  skipped?: boolean;
  answers?: PlanQuestionAnswer[];
}

export interface PlanTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface PlanCreatedPayload {
  planId: string;
  title: string;
  markdown: string;
  todos?: PlanTodoItem[];
}

export interface PlanUpdatedPayload {
  planId: string;
  title: string;
  markdown: string;
  todos?: PlanTodoItem[];
}

export interface PlanConfirmedPayload {
  planId: string;
  title: string;
  /** Confirm 后升格到的 mode（通常 agent） */
  mode: HarnessMode;
}

export interface PlanSummary {
  planId: string;
  title: string;
  updatedAt: number;
  confirmed?: boolean;
}

export interface PlanRecord {
  planId: string;
  title: string;
  markdown: string;
  todos: PlanTodoItem[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
}
export interface SkillActivatedPayload {
  names: string[];
  paths: string[];
  tokenEstimate: number;
  truncated?: boolean;
}

export interface SessionRecoveredPayload {
  sessionId: string;
  messageCount: number;
  eventsReplayed: number;
  mode: HarnessMode;
  stoppedAtBoundary: boolean;
  recoveredAt: number;
}

/** auto=回合内分层；manual=用户点「压缩」（SM/full，不走 micro） */
export type CompactionMethod = 'micro' | 'session-memory' | 'full' | 'auto' | 'manual';

export interface CompactionResult {
  metadata: {
    method: 'micro' | 'session-memory' | 'full';
    removedMessageCount: number;
    tokensSaved: number;
    mode: string;
  };
  structured?: {
    decisions: Array<{ content: string; reasoning?: string }>;
    fileChanges: Array<{ path: string; operation: string; summary: string }>;
    discoveries: Array<{ type: string; content: string }>;
    todos: Array<{ content: string; status: string }>;
    context: string[];
  };
  narrative: string;
  keyMessageIds?: string[];
}

export interface CompactionSuggestedPayload {
  urgency: ContextUrgency;
  usageRatio: number;
  recommended: CompactionMethod;
  reason?: string;
}

export interface CompactionProgressPayload {
  method: CompactionMethod;
  stage: string;
  progressPercent?: number;
}

export interface CompactionCompletedPayload {
  result: CompactionResult;
  contextUsage?: ContextUsageSnapshot;
}

export interface TokenPayload {
  delta: string;
}

export interface ToolCallStartPayload {
  toolCallId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
}

export interface ToolCallResultPayload {
  toolCallId: string;
  toolName: string;
  resultPreview?: string;
  isError?: boolean;
}

export interface CompletePayload {
  messageId?: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface ModeChangedPayload {
  mode: HarnessMode;
  previousMode?: HarnessMode;
}

export interface PermissionRequestPayload {
  permissionId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  reason?: string;
  sessionId: string;
}

export interface PermissionResolvedPayload {
  permissionId: string;
  decision: 'allow' | 'deny';
  toolName: string;
}

export interface MemoryInjectedPayload {
  paths: string[];
  tokenEstimate: number;
}

export interface ContextBucket {
  id: ContextBucketId;
  label: string;
  tokens: number;
}

export interface ContextUsageSnapshot {
  sessionId: string;
  /** 估算值；UI 显示加「~」 */
  estimated: boolean;
  modelContextLimit: number;
  reservedOutputTokens: number;
  effectiveLimit: number;
  totalTokens: number;
  usageRatio: number;
  urgency: ContextUrgency;
  buckets: ContextBucket[];
  updatedAt: string;
}

export interface ChatSendRequest {
  message: string;
  mode?: HarnessMode;
  /** Phase 3：指定本轮模型；缺省用 session.modelRef 或全局默认 */
  modelRef?: ModelRef;
  /** Phase 4.2：本轮启用的 MCP server id；缺省用 session 已存启用集 */
  enabledMcp?: string[];
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface SessionResponse {
  id: string;
  workspace: string;
  mode: HarnessMode;
  createdAt: number;
  modelRef?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  maxMode?: boolean;
}

export type PolicyDecision = 'allow' | 'deny' | 'ask';

export interface PolicyContext {
  mode: HarnessMode;
  toolName: string;
  toolInput?: Record<string, unknown>;
  workspace: string;
  preset?: PermissionPreset;
  /** MCP / ext 工具的 readOnlyHint（未知则为 undefined） */
  readOnlyHint?: boolean;
  /** Debug：本 session log 绝对路径；delete_file 仅允许此路径 */
  debugLogPath?: string;
  /** Debug：workspace-relative log path */
  debugLogPathRel?: string;
  /**
   * Debug：用户已 Proceed / Mark as fixed，本轮允许读 session log。
   * 缺省视为未解锁。跑测试/受测程序不依赖此开关。
   */
  debugAnalyzeUnlocked?: boolean;
  /**
   * Debug：用户已 Mark as fixed，本轮允许去掉探针。
   * Proceed 只分析/修代码，不得剥掉 `#region agent log`。
   */
  debugCleanupUnlocked?: boolean;
  /** ≥1 时处于 subagent 子循环；嵌套 Task / 写工具硬拒 */
  subagentDepth?: number;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason?: string;
}

export interface AuditEntry {
  id?: number;
  timestamp: string;
  sessionId: string;
  mode: string;
  tool: string;
  source: 'builtin' | 'extension' | 'mcp';
  decision: PolicyDecision;
  reason: string;
  targetSummary?: string;
  userOverride?: boolean;
}

export type SessionEventType =
  | 'session_start'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'compaction'
  | 'mode_change'
  | 'model_change'
  | 'file_edit'
  | 'plan_created'
  | 'plan_updated'
  | 'plan_confirmed'
  | 'rewind'
  | 'fork'
  /** 定稿后的 Thought 分段（供 resume 重建） */
  | 'thinking'
  /** turn 结束耗时（供 Worked for 重建） */
  | 'turn_complete';

/** append-only 事件；字段按 type 扩展，损坏行可跳过 */
export interface SessionEvent {
  type: SessionEventType;
  ts: number;
  [key: string]: unknown;
}

export interface SessionMeta {
  sessionId: string;
  workspace: string;
  lastEventOffset: number;
  snapshotPoints: number[];
  currentState: {
    mode: HarnessMode;
    messageCount: number;
    tokenEstimate: number;
    createdAt: number;
    modelRef?: ModelRef;
    title?: string;
    thinkingLevel?: ThinkingLevel;
    maxMode?: boolean;
    /** 当前活跃 / 最近创建的计划 */
    activePlanId?: string;
    /** 已 Confirm 并注入 context 的计划 */
    confirmedPlanId?: string;
    /** Debug session 摘要（ingest 运行时） */
    debug?: {
      debugSessionId: string;
      logPathRel: string;
      status: DebugSessionStatus;
    };
  };
}
