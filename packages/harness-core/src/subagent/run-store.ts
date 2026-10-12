import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  SubagentRunMeta,
  SubagentRunStatus,
  SummarySchemaV1,
  SubagentStopReason,
} from '@ciro-code/harness-shared';

export function subagentsDir(parentSessionDir: string): string {
  return join(parentSessionDir, 'subagents');
}

export function subagentRunDir(parentSessionDir: string, taskId: string): string {
  return join(subagentsDir(parentSessionDir), taskId);
}

export function writeSubagentMeta(parentSessionDir: string, meta: SubagentRunMeta): void {
  const dir = subagentRunDir(parentSessionDir, meta.taskId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

export function readSubagentMeta(
  parentSessionDir: string,
  taskId: string,
): SubagentRunMeta | null {
  const path = join(subagentRunDir(parentSessionDir, taskId), 'meta.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SubagentRunMeta;
  } catch {
    return null;
  }
}

export function listSubagentMetas(parentSessionDir: string): SubagentRunMeta[] {
  const root = subagentsDir(parentSessionDir);
  if (!existsSync(root)) return [];
  const out: SubagentRunMeta[] = [];
  for (const name of readdirSync(root)) {
    const meta = readSubagentMeta(parentSessionDir, name);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export function appendSubagentEvent(
  parentSessionDir: string,
  taskId: string,
  event: Record<string, unknown>,
): Record<string, unknown> {
  const dir = subagentRunDir(parentSessionDir, taskId);
  mkdirSync(dir, { recursive: true });
  const recorded = { ...event, ts: Date.now() };
  const line = JSON.stringify(recorded) + '\n';
  writeFileSync(join(dir, 'events.jsonl'), line, { flag: 'a' });
  publishSubagentEvent(taskId, recorded);
  return recorded;
}

type SubagentEventListener = (event: Record<string, unknown>) => void;
const subagentLiveListeners = new Map<string, Set<SubagentEventListener>>();

function publishSubagentEvent(taskId: string, event: Record<string, unknown>): void {
  const set = subagentLiveListeners.get(taskId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // ignore subscriber errors
    }
  }
}

/** 订阅某 task 的实时事件（append 之后）；返回取消函数 */
export function subscribeSubagentLive(
  taskId: string,
  listener: SubagentEventListener,
): () => void {
  let set = subagentLiveListeners.get(taskId);
  if (!set) {
    set = new Set();
    subagentLiveListeners.set(taskId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) subagentLiveListeners.delete(taskId);
  };
}

/** replay 已落盘事件，再跟 live；终态事件或 signal abort 后结束 */
export async function* streamSubagentEvents(
  parentSessionDir: string,
  taskId: string,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  const terminal = new Set(['completed', 'stopped', 'failed']);
  for (const ev of readSubagentEvents(parentSessionDir, taskId)) {
    yield ev;
    if (typeof ev.type === 'string' && terminal.has(ev.type)) return;
  }
  if (signal?.aborted) return;

  const queue: Record<string, unknown>[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  const unsub = subscribeSubagentLive(taskId, (ev) => {
    queue.push(ev);
    wake?.();
  });

  const onAbort = () => {
    done = true;
    wake?.();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (!done && !signal?.aborted) {
      while (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
        if (typeof ev.type === 'string' && terminal.has(ev.type)) {
          done = true;
          break;
        }
      }
      if (done || signal?.aborted) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (queue.length > 0 || signal?.aborted) resolve();
      });
      wake = null;
    }
  } finally {
    unsub();
    signal?.removeEventListener('abort', onAbort);
  }
}

export function readSubagentEvents(
  parentSessionDir: string,
  taskId: string,
): Record<string, unknown>[] {
  const path = join(subagentRunDir(parentSessionDir, taskId), 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((e): e is Record<string, unknown> => e != null);
}

export function removeAllSubagents(parentSessionDir: string): void {
  const root = subagentsDir(parentSessionDir);
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
}

const TERMINAL: ReadonlySet<SubagentRunStatus> = new Set([
  'completed',
  'failed',
  'stopped',
]);

/** 淘汰最旧已终态 run，保留进行中 */
export function pruneRetainedSubagents(
  parentSessionDir: string,
  maxRetained: number,
): string[] {
  if (maxRetained < 1) return [];
  const metas = listSubagentMetas(parentSessionDir).filter((m) =>
    TERMINAL.has(m.status),
  );
  if (metas.length <= maxRetained) return [];
  const sorted = [...metas].sort(
    (a, b) => (a.completedAt ?? a.updatedAt) - (b.completedAt ?? b.updatedAt),
  );
  const toRemove = sorted.slice(0, metas.length - maxRetained);
  const removed: string[] = [];
  for (const m of toRemove) {
    const dir = subagentRunDir(parentSessionDir, m.taskId);
    rmSync(dir, { recursive: true, force: true });
    removed.push(m.taskId);
  }
  return removed;
}

export function patchSubagentMeta(
  parentSessionDir: string,
  taskId: string,
  patch: Partial<SubagentRunMeta> & {
    status?: SubagentRunStatus;
    summary?: SummarySchemaV1;
    error?: string;
    reason?: SubagentStopReason;
  },
): SubagentRunMeta | null {
  const prev = readSubagentMeta(parentSessionDir, taskId);
  if (!prev) return null;
  const next: SubagentRunMeta = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  if (patch.status && TERMINAL.has(patch.status) && !next.completedAt) {
    next.completedAt = Date.now();
  }
  writeSubagentMeta(parentSessionDir, next);
  return next;
}

/** resume：磁盘 running 但进程无控制器 → 纠为 stopped(disconnected) */
export function reconcileOrphanRunning(
  parentSessionDir: string,
  liveTaskIds: ReadonlySet<string>,
): SubagentRunMeta[] {
  const fixed: SubagentRunMeta[] = [];
  for (const meta of listSubagentMetas(parentSessionDir)) {
    if (meta.status !== 'running') continue;
    if (liveTaskIds.has(meta.taskId)) continue;
    const next = patchSubagentMeta(parentSessionDir, meta.taskId, {
      status: 'stopped',
      reason: 'disconnected',
      error: 'Subagent run lost after disconnect',
    });
    if (next) fixed.push(next);
  }
  return fixed;
}
