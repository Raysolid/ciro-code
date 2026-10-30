import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionEvent } from '@ciro-code/harness-shared';

export interface TranscriptHit {
  ts: number;
  type: string;
  messageId?: string;
  toolCallId?: string;
  role?: string;
  toolName?: string;
  snippet: string;
}

export interface SearchTranscriptOptions {
  /** 最大命中数；默认 20 */
  limit?: number;
  /** 单条 snippet 最大字符；默认 800 */
  snippetChars?: number;
  /** 全部 snippet 合计硬顶；默认 12000 */
  totalChars?: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_SNIPPET = 800;
const DEFAULT_TOTAL = 12_000;

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function haystackForEvent(event: SessionEvent): string | null {
  if (event.type === 'message') {
    const role = typeof event.role === 'string' ? event.role : '';
    const content = typeof event.content === 'string' ? event.content : '';
    return `${role}\n${content}`;
  }
  if (event.type === 'tool_call') {
    const name = typeof event.toolName === 'string' ? event.toolName : '';
    let input = '';
    try {
      input = JSON.stringify(event.toolInput ?? {});
    } catch {
      input = String(event.toolInput ?? '');
    }
    return `${name}\n${input}`;
  }
  if (event.type === 'compaction') {
    const narrative = typeof event.narrative === 'string' ? event.narrative : '';
    return narrative || null;
  }
  return null;
}

function toHit(event: SessionEvent, haystack: string, snippetChars: number): TranscriptHit {
  const hit: TranscriptHit = {
    ts: event.ts,
    type: event.type,
    snippet: clip(haystack.trim(), snippetChars),
  };
  if (typeof event.messageId === 'string') hit.messageId = event.messageId;
  if (typeof event.toolCallId === 'string') hit.toolCallId = event.toolCallId;
  if (typeof event.role === 'string') hit.role = event.role;
  if (typeof event.toolName === 'string') hit.toolName = event.toolName;
  return hit;
}

/** 在已加载的 session events 上做大小写不敏感子串检索（有界） */
export function searchTranscriptEvents(
  events: SessionEvent[],
  query: string,
  opts: SearchTranscriptOptions = {},
): TranscriptHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT));
  const snippetChars = Math.max(40, Math.floor(opts.snippetChars ?? DEFAULT_SNIPPET));
  const totalChars = Math.max(snippetChars, Math.floor(opts.totalChars ?? DEFAULT_TOTAL));

  const hits: TranscriptHit[] = [];
  let used = 0;
  for (const event of events) {
    const hay = haystackForEvent(event);
    if (!hay || !hay.toLowerCase().includes(q)) continue;
    const hit = toHit(event, hay, snippetChars);
    if (used + hit.snippet.length > totalChars && hits.length > 0) break;
    hits.push(hit);
    used += hit.snippet.length;
    if (hits.length >= limit) break;
  }
  return hits;
}

/** 从 sessionDir/events.jsonl 读取并检索 */
export function searchTranscriptSessionDir(
  sessionDir: string,
  query: string,
  opts: SearchTranscriptOptions = {},
): TranscriptHit[] {
  const path = join(sessionDir, 'events.jsonl');
  if (!existsSync(path)) return [];
  const events: SessionEvent[] = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as SessionEvent);
    } catch {
      // skip corrupt
    }
  }
  return searchTranscriptEvents(events, query, opts);
}

export const TOOL_RESULT_CONTENT_CAP = 32_000;

/** 截断 tool result 全文，避免回灌过大 */
export function capToolResultContent(content: string, max = TOOL_RESULT_CONTENT_CAP): string {
  return clip(content, max);
}
