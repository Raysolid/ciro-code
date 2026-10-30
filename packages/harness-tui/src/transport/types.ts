import type {
  CompactSessionOptions,
  SubagentRunView,
} from '@ciro-code/harness-core';
import type {
  CompactionResult,
  ContextUsageSnapshot,
  DebugSessionInfo,
  FileChangeRecord,
  GitWorkspaceStatus,
  HarnessMode,
  ModelRef,
  PlanQuestionResolveBody,
  PlanRecord,
  PlanSummary,
  SessionCreateOptions,
  SessionHandle,
  SseEnvelope,
  SubagentRunMeta,
  ThinkingLevel,
  UserMessage,
} from '@ciro-code/harness-shared';

export interface TurnCtxLite {
  mode?: HarnessMode;
  modelRef?: ModelRef;
  thinkingLevel?: ThinkingLevel;
  maxMode?: boolean;
}

export interface AvailableModel {
  modelRef: ModelRef;
  label?: string;
}

export interface ResumeResult {
  session: SessionHandle;
  messages: Array<{ id: string; role: 'user' | 'assistant' | 'compaction'; content: string }>;
  contextUsage?: ContextUsageSnapshot;
  confirmedPlanId?: string;
}

/** Transport 面：操作走 runtime，枚举走 Store（D12） */
export interface TuiTransport {
  readonly kind: 'in-process' | 'http' | 'stdio';

  createSession(opts: SessionCreateOptions): Promise<SessionHandle>;
  resumeSession(id: string): Promise<ResumeResult>;
  deleteSession(id: string): Promise<void>;
  setMode(id: string, mode: HarnessMode): Promise<SessionHandle | undefined>;
  setModelRef(id: string, modelRef: ModelRef | undefined): Promise<SessionHandle | undefined>;
  setThinkingLevel(
    id: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<SessionHandle | undefined>;
  setTitle(id: string, title: string | undefined): Promise<SessionHandle | undefined>;
  setMaxMode(id: string, maxMode: boolean): Promise<SessionHandle | undefined>;

  listSessions(): Promise<SessionHandle[]>;
  listAvailableModels(): Promise<AvailableModel[]>;

  send(
    sessionId: string,
    msg: UserMessage,
    opts?: TurnCtxLite,
  ): AsyncIterable<SseEnvelope>;
  attach(sessionId: string, fromSeq?: number): AsyncIterable<SseEnvelope>;
  abort(sessionId: string): Promise<void>;
  subscribeActivity(): AsyncIterable<SseEnvelope>;

  resolvePermission(id: string, decision: 'allow' | 'deny'): Promise<boolean>;
  resolveModeSuggest(id: string, decision: 'switch' | 'skip'): Promise<boolean>;
  resolvePlanQuestion(questionId: string, body: PlanQuestionResolveBody): Promise<boolean>;

  getContextUsage(id: string): ContextUsageSnapshot | undefined;
  compact(id: string, method?: CompactSessionOptions): Promise<{
    result: CompactionResult;
    contextUsage?: ContextUsageSnapshot;
  }>;

  listPlans(id: string): PlanSummary[];
  getPlan(id: string, planId: string): PlanRecord | undefined;
  confirmPlan(id: string, planId: string): Promise<{ session: SessionHandle; plan: PlanRecord }>;

  listFileChanges(id: string): FileChangeRecord[];
  acceptFileChange(id: string, path: string): FileChangeRecord;
  rejectFileChange(id: string, path: string): FileChangeRecord;

  listSubagents(id: string): SubagentRunMeta[];
  getSubagent(id: string, taskId: string): SubagentRunView | null;
  abortSubagent(id: string, taskId: string): Promise<boolean>;

  getDebugSession(id: string): DebugSessionInfo | undefined;
  proceedDebug(id: string): Promise<DebugSessionInfo>;
  markDebugFixed(id: string): Promise<DebugSessionInfo>;

  getGitStatus(): Promise<GitWorkspaceStatus | undefined>;

  dispose(): void;
}
