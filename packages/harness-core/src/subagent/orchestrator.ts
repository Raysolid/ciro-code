import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SUBAGENTS_CONFIG,
  isSummarySchemaV1,
  type SseEnvelope,
  type SubagentCompletedPayload,
  type SubagentProgressPayload,
  type SubagentRunEvent,
  type SubagentRunMeta,
  type SubagentStartPayload,
  type SubagentStopReason,
  type SubagentType,
  type SubagentsConfig,
  type SummarySchemaV1,
} from '@ciro-code/harness-shared';
import {
  appendSubagentEvent,
  listSubagentMetas,
  patchSubagentMeta,
  pruneRetainedSubagents,
  readSubagentMeta,
  reconcileOrphanRunning,
  removeAllSubagents,
  streamSubagentEvents,
  writeSubagentMeta,
} from './run-store.js';

export type SubagentSsePush = (envelope: SseEnvelope) => void;

export interface ExploreRunInput {
  taskId: string;
  parentSessionId: string;
  workspace: string;
  prompt: string;
  title: string;
  subagentType?: SubagentType;
  signal: AbortSignal;
  /** 父卡片第二行短句 + 写入 progress 事件 */
  onProgress: (text: string) => void;
  /** 子 Tab 流事件（token/tool/thinking 等）；orchestrator 会落盘并 fan-out */
  onEvent: (event: Omit<SubagentRunEvent, 'ts'>) => void;
}

export type ExploreRunner = (input: ExploreRunInput) => Promise<SummarySchemaV1>;

export interface TaskExploreResult {
  ok: boolean;
  taskId: string;
  status: 'completed' | 'failed' | 'stopped' | 'running';
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
  subagentType?: SubagentType;
  /** tool result JSON text for parent model */
  toolResultText: string;
}

function makeEnvelope<T>(
  type: string,
  payload: T,
  sessionId: string,
): SseEnvelope<T> {
  return {
    type,
    ts: Date.now(),
    conversationId: sessionId,
    payload,
  };
}

function titleFromPrompt(prompt: string, kind: SubagentType): string {
  const fallback =
    kind === 'verify'
      ? 'Verify'
      : kind === 'shell'
        ? 'Shell'
        : kind === 'browser'
          ? 'Browser'
          : 'Explore';
  const line = prompt.trim().split(/\r?\n/)[0] ?? fallback;
  return line.length > 72 ? `${line.slice(0, 69)}…` : line || fallback;
}

export class SubagentOrchestrator {
  private readonly controllers = new Map<string, AbortController>();
  private readonly parentOfTask = new Map<string, string>();
  /** parentSessionId → in-flight taskIds */
  private readonly inflight = new Map<string, Set<string>>();
  private readonly config: SubagentsConfig;
  private readonly resolveSessionDir: (parentSessionId: string) => string | null;
  private readonly exploreRunner: ExploreRunner;

  constructor(opts: {
    config?: Partial<SubagentsConfig>;
    resolveSessionDir: (parentSessionId: string) => string | null;
    /** 必填：Pi LLM / Mock 脚本；禁止扫盘兜底 */
    exploreRunner: ExploreRunner;
  }) {
    this.config = { ...DEFAULT_SUBAGENTS_CONFIG, ...opts.config };
    this.resolveSessionDir = opts.resolveSessionDir;
    this.exploreRunner = opts.exploreRunner;
  }

  get liveTaskIds(): ReadonlySet<string> {
    return new Set(this.controllers.keys());
  }

  isLive(taskId: string): boolean {
    return this.controllers.has(taskId);
  }

  inflightCount(parentSessionId: string): number {
    return this.inflight.get(parentSessionId)?.size ?? 0;
  }

  async runExplore(opts: {
    parentSessionId: string;
    workspace: string;
    prompt: string;
    title?: string;
    subagentType?: SubagentType;
    push?: SubagentSsePush;
    /** true：占槽后立即返回 running，终态走 onSettled */
    background?: boolean;
    /** 仅 background：终态回调（同步路径勿用，避免与 tool result 双投递） */
    onSettled?: (result: TaskExploreResult) => void;
    /** 测试注入：跳过实际 explore */
    injectSummary?: SummarySchemaV1;
    injectError?: string;
  }): Promise<TaskExploreResult> {
    const kind: SubagentType = opts.subagentType ?? 'explore';
    const parentSessionId = opts.parentSessionId;
    const maxParallel = this.config.maxParallel;
    if (this.inflightCount(parentSessionId) >= maxParallel) {
      return {
        ok: false,
        taskId: '',
        status: 'failed',
        error: `maxParallel=${maxParallel} exceeded`,
        reason: 'max_parallel',
        subagentType: kind,
        toolResultText: JSON.stringify({
          status: 'error',
          message: `Cannot start explore: maxParallel=${maxParallel} exceeded`,
          reason: 'max_parallel',
        }),
      };
    }

    const sessionDir = this.resolveSessionDir(parentSessionId);
    if (!sessionDir) {
      return {
        ok: false,
        taskId: '',
        status: 'failed',
        error: 'Parent session directory unavailable',
        subagentType: kind,
        toolResultText: JSON.stringify({
          status: 'error',
          message: 'Parent session directory unavailable',
        }),
      };
    }

    const taskId = randomUUID();
    const title = opts.title?.trim() || titleFromPrompt(opts.prompt, kind);
    const ac = new AbortController();
    this.controllers.set(taskId, ac);
    this.parentOfTask.set(taskId, parentSessionId);
    let set = this.inflight.get(parentSessionId);
    if (!set) {
      set = new Set();
      this.inflight.set(parentSessionId, set);
    }
    set.add(taskId);

    const background = opts.background === true;
    const meta: SubagentRunMeta = {
      taskId,
      parentSessionId,
      subagentType: kind,
      title,
      prompt: opts.prompt,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(background ? { background: true } : {}),
    };
    writeSubagentMeta(sessionDir, meta);
    appendSubagentEvent(sessionDir, taskId, { type: 'start', title });

    const startPayload: SubagentStartPayload = {
      taskId,
      subagentType: kind,
      title,
      status: 'running',
      parentSessionId,
      ...(background ? { background: true } : {}),
    };
    opts.push?.(makeEnvelope('subagent_start', startPayload, parentSessionId));

    const timeoutMs = this.config.timeoutMs;
    const timer = setTimeout(() => {
      this.abortTask(taskId, 'timeout');
    }, timeoutMs);

    const onEvent = (event: Omit<SubagentRunEvent, 'ts'>) => {
      appendSubagentEvent(sessionDir, taskId, event as Record<string, unknown>);
    };

    const pushProgress = (progressText: string) => {
      onEvent({ type: 'progress', progressText });
      const payload: SubagentProgressPayload = {
        taskId,
        subagentType: kind,
        status: 'running',
        progressText,
        parentSessionId,
      };
      opts.push?.(makeEnvelope('subagent_progress', payload, parentSessionId));
    };

    const runBody = async (): Promise<TaskExploreResult> => {
      try {
        if (opts.injectError) {
          throw new Error(opts.injectError);
        }
        const summary =
          opts.injectSummary ??
          (await this.exploreRunner({
            taskId,
            parentSessionId,
            workspace: opts.workspace,
            prompt: opts.prompt,
            title,
            subagentType: kind,
            signal: ac.signal,
            onProgress: pushProgress,
            onEvent,
          }));

        if (ac.signal.aborted) {
          return this.finalizeStopped(
            sessionDir,
            taskId,
            parentSessionId,
            title,
            kind,
            opts.push,
            'user',
          );
        }
        if (!isSummarySchemaV1(summary)) {
          return this.finalizeFailed(
            sessionDir,
            taskId,
            parentSessionId,
            title,
            kind,
            opts.push,
            'Invalid summary_schema_v1 from explore',
          );
        }

        patchSubagentMeta(sessionDir, taskId, { status: 'completed', summary });
        appendSubagentEvent(sessionDir, taskId, { type: 'completed', summary });
        const completed: SubagentCompletedPayload = {
          taskId,
          subagentType: kind,
          title,
          status: 'completed',
          parentSessionId,
          summary,
        };
        opts.push?.(makeEnvelope('subagent_completed', completed, parentSessionId));
        pruneRetainedSubagents(sessionDir, this.config.maxRetainedRuns);
        return {
          ok: true,
          taskId,
          status: 'completed',
          summary,
          subagentType: kind,
          toolResultText: JSON.stringify(summary),
        };
      } catch (err) {
        if (ac.signal.aborted) {
          const reason =
            (ac as AbortController & { __reason?: SubagentStopReason }).__reason ?? 'user';
          return this.finalizeStopped(
            sessionDir,
            taskId,
            parentSessionId,
            title,
            kind,
            opts.push,
            reason,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        return this.finalizeFailed(
          sessionDir,
          taskId,
          parentSessionId,
          title,
          kind,
          opts.push,
          message,
        );
      } finally {
        clearTimeout(timer);
        this.cleanupTask(taskId, parentSessionId);
      }
    };

    if (background) {
      const toolResultText = JSON.stringify({
        status: 'running',
        taskId,
        subagent_type: kind,
      });
      void runBody()
        .then((result) => {
          opts.onSettled?.(result);
        })
        .catch(() => {
          /* runBody 不抛；防御 */
        });
      return {
        ok: true,
        taskId,
        status: 'running',
        subagentType: kind,
        toolResultText,
      };
    }

    return runBody();
  }

  abortTask(taskId: string, reason: SubagentStopReason = 'user'): boolean {
    const ac = this.controllers.get(taskId);
    if (!ac) return false;
    (ac as AbortController & { __reason?: SubagentStopReason }).__reason = reason;
    ac.abort();
    return true;
  }

  abortAllForParent(parentSessionId: string, reason: SubagentStopReason): void {
    const set = this.inflight.get(parentSessionId);
    if (!set) return;
    for (const id of [...set]) {
      this.abortTask(id, reason);
    }
  }

  disposeParent(parentSessionId: string, sessionDir: string | null): void {
    this.abortAllForParent(parentSessionId, 'parent_deleted');
    if (sessionDir) removeAllSubagents(sessionDir);
  }

  clearSubagentsOnly(sessionDir: string): void {
    removeAllSubagents(sessionDir);
  }

  listMetas(parentSessionDir: string): SubagentRunMeta[] {
    return listSubagentMetas(parentSessionDir);
  }

  getMeta(parentSessionDir: string, taskId: string): SubagentRunMeta | null {
    return readSubagentMeta(parentSessionDir, taskId);
  }

  reconcileOnResume(parentSessionDir: string): SubagentRunMeta[] {
    return reconcileOrphanRunning(parentSessionDir, this.liveTaskIds);
  }

  streamEvents(
    parentSessionDir: string,
    taskId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>> {
    return streamSubagentEvents(parentSessionDir, taskId, signal);
  }

  private cleanupTask(taskId: string, parentSessionId: string): void {
    this.controllers.delete(taskId);
    this.parentOfTask.delete(taskId);
    const set = this.inflight.get(parentSessionId);
    if (set) {
      set.delete(taskId);
      if (set.size === 0) this.inflight.delete(parentSessionId);
    }
  }

  private finalizeStopped(
    sessionDir: string,
    taskId: string,
    parentSessionId: string,
    title: string,
    kind: SubagentType,
    push: SubagentSsePush | undefined,
    reason: SubagentStopReason,
  ): TaskExploreResult {
    const error =
      reason === 'timeout'
        ? 'Explore timed out'
        : reason === 'parent_abort'
          ? 'Stopped because parent turn was aborted'
          : reason === 'parent_deleted'
            ? 'Stopped because parent session was deleted'
            : 'Explore stopped';
    patchSubagentMeta(sessionDir, taskId, { status: 'stopped', reason, error });
    appendSubagentEvent(sessionDir, taskId, { type: 'stopped', reason });
    const completed: SubagentCompletedPayload = {
      taskId,
      subagentType: kind,
      title,
      status: 'stopped',
      parentSessionId,
      error,
      reason,
    };
    push?.(makeEnvelope('subagent_completed', completed, parentSessionId));
    return {
      ok: false,
      taskId,
      status: 'stopped',
      error,
      reason,
      subagentType: kind,
      toolResultText: JSON.stringify({ status: 'stopped', message: error, reason }),
    };
  }

  private finalizeFailed(
    sessionDir: string,
    taskId: string,
    parentSessionId: string,
    title: string,
    kind: SubagentType,
    push: SubagentSsePush | undefined,
    message: string,
  ): TaskExploreResult {
    patchSubagentMeta(sessionDir, taskId, { status: 'failed', error: message });
    appendSubagentEvent(sessionDir, taskId, { type: 'failed', error: message });
    const completed: SubagentCompletedPayload = {
      taskId,
      subagentType: kind,
      title,
      status: 'failed',
      parentSessionId,
      error: message,
    };
    push?.(makeEnvelope('subagent_completed', completed, parentSessionId));
    return {
      ok: false,
      taskId,
      status: 'failed',
      error: message,
      subagentType: kind,
      toolResultText: JSON.stringify({ status: 'error', message }),
    };
  }
}
