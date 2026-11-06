import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SessionEvent } from '@ciro-code/harness-shared';
import { ToolResultStore } from '../compaction/tool-result-store.js';
import {
  capToolResultContent,
  searchTranscriptEvents,
  searchTranscriptSessionDir,
  TOOL_RESULT_CONTENT_CAP,
} from './transcript-search.js';

describe('searchTranscriptEvents', () => {
  it('finds early user message after compaction-like history', () => {
    const events: SessionEvent[] = [
      {
        type: 'message',
        ts: 1,
        role: 'user',
        messageId: 'm1',
        content: 'UNIQUE_NEEDLE_EARLY redis cache',
      },
      {
        type: 'message',
        ts: 2,
        role: 'assistant',
        messageId: 'm2',
        content: 'ok',
      },
      {
        type: 'compaction',
        ts: 3,
        narrative: 'Session-memory compacted',
        method: 'session-memory',
      },
      {
        type: 'message',
        ts: 4,
        role: 'user',
        messageId: 'm3',
        content: 'continue',
      },
    ];
    const hits = searchTranscriptEvents(events, 'UNIQUE_NEEDLE_EARLY');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe('m1');
    expect(hits[0]?.snippet).toContain('UNIQUE_NEEDLE_EARLY');
  });

  it('matches tool_call name/input and respects limit', () => {
    const events: SessionEvent[] = Array.from({ length: 5 }, (_, i) => ({
      type: 'tool_call' as const,
      ts: i,
      toolCallId: `tc${i}`,
      toolName: 'bash',
      toolInput: { command: `echo HIT_${i}` },
    }));
    const hits = searchTranscriptEvents(events, 'HIT_', { limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0]?.toolCallId).toBe('tc0');
  });

  it('reads from sessionDir events.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tx-search-'));
    writeFileSync(
      join(dir, 'events.jsonl'),
      [
        JSON.stringify({
          type: 'message',
          ts: 1,
          role: 'user',
          messageId: 'u1',
          content: 'findme_in_jsonl',
        }),
      ].join('\n'),
      'utf-8',
    );
    const hits = searchTranscriptSessionDir(dir, 'findme_in_jsonl');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.messageId).toBe('u1');
  });

  it('capToolResultContent truncates large bodies', () => {
    const big = 'Z'.repeat(TOOL_RESULT_CONTENT_CAP + 100);
    const capped = capToolResultContent(big);
    expect(capped.length).toBeLessThanOrEqual(TOOL_RESULT_CONTENT_CAP);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('ToolResultStore pointer body is readable for get_tool_result path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tx-tool-'));
    mkdirSync(join(dir, 'tool-results'), { recursive: true });
    const store = new ToolResultStore(dir);
    const full = 'FULL_TOOL_BODY_' + 'x'.repeat(200);
    store.write('abc123', 'bash', full, 'pointer');
    const read = store.read('abc123');
    expect(read?.content).toBe(full);
    expect(capToolResultContent(read!.content)).toContain('FULL_TOOL_BODY_');
  });
});
