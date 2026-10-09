import type { ChangeDisposition, FileChangeRecord, SessionEvent } from '@ciro/harness-shared';

export type ChangeReviewLookup = Map<
  string,
  { disposition: ChangeDisposition; reviewable: boolean }
>;

/** 从 events.jsonl 收集 file_edit；同 path 保留最新；可选合并审阅状态 */
export function collectFileChanges(
  events: SessionEvent[],
  reviews?: ChangeReviewLookup,
): FileChangeRecord[] {
  const byPath = new Map<string, FileChangeRecord>();
  for (const ev of events) {
    if (ev.type !== 'file_edit') continue;
    const path = typeof ev.path === 'string' ? ev.path : '';
    if (!path) continue;
    const operation = ev.operation === 'edit' ? 'edit' : 'write';
    const record: FileChangeRecord = {
      path,
      operation,
      summary: typeof ev.summary === 'string' ? ev.summary : `${operation} ${path}`,
      unifiedDiff: typeof ev.unifiedDiff === 'string' ? ev.unifiedDiff : '',
      ts: typeof ev.ts === 'number' ? ev.ts : Date.now(),
      toolCallId: typeof ev.toolCallId === 'string' ? ev.toolCallId : undefined,
      truncated: ev.truncated === true,
    };
    byPath.set(path, record);
  }

  const list = [...byPath.values()].sort((a, b) => b.ts - a.ts);
  if (!reviews) return list;

  for (const record of list) {
    const r = reviews.get(record.path);
    if (r) {
      record.disposition = r.disposition;
      record.reviewable = r.reviewable;
    } else {
      record.disposition = 'pending';
      record.reviewable = false;
    }
  }
  return list;
}
