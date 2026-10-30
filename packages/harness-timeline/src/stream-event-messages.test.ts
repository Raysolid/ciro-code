import { describe, expect, it } from 'vitest';
import type { FileChangeRecord } from '@ciro-code/harness-shared';
import type { ChatMessage } from './chat-message.js';
import { upsertTextDelta, upsertThoughtDelta } from './message-timeline.js';
import {
  applyFileChangedDiff,
  applyStreamComplete,
  applyStreamError,
  applyToolCallResult,
  applyToolCallStart,
  settleStreamingMessages,
} from './stream-event-messages.js';

function assistant(id = 'a1'): ChatMessage[] {
  return [{ id, role: 'assistant', content: '', status: 'streaming', timeline: [] }];
}

describe('stream-event-messages', () => {
  it('applies tool start then result', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = applyToolCallStart(msgs, id, {
      toolCallId: 't1',
      toolName: 'read',
      toolInput: { path: 'a.ts' },
    });
    msgs = applyToolCallResult(msgs, id, {
      toolCallId: 't1',
      resultPreview: 'ok',
    });
    const tool = msgs[0]!.timeline!.find((i) => i.kind === 'tool');
    expect(tool).toMatchObject({
      id: 't1',
      toolName: 'read',
      status: 'done',
      preview: 'ok',
    });
  });

  it('file_changed adds diff after closing open thought', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertThoughtDelta(msgs, id, 'thinking', 1000);
    const change: FileChangeRecord = {
      path: 'src/a.ts',
      operation: 'edit',
      summary: '1 line',
      unifiedDiff: '--- a\n+++ b\n',
      ts: 1,
    };
    msgs = applyFileChangedDiff(msgs, id, change);
    const tl = msgs[0]!.timeline!;
    expect(tl.some((i) => i.kind === 'thought' && (i as { ended?: boolean }).ended)).toBe(true);
    expect(tl.some((i) => i.kind === 'diff' && i.path === 'src/a.ts')).toBe(true);
  });

  it('error closes thought+text and sets status', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertThoughtDelta(msgs, id, 'plan', 1000);
    msgs = upsertTextDelta(msgs, id, 'partial', 2000);
    msgs = applyStreamError(msgs, id, 'boom');
    const m = msgs[0]!;
    expect(m.status).toBe('error');
    expect(m.content).toBe('boom');
    expect(m.timeline!.every((i) => i.kind !== 'thought' || i.ended)).toBe(true);
    expect(m.timeline!.every((i) => i.kind !== 'text' || i.ended)).toBe(true);
  });

  it('complete closes thought+text and marks completed', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertThoughtDelta(msgs, id, 'plan', 1000);
    msgs = upsertTextDelta(msgs, id, 'done text', 2000);
    msgs = applyStreamComplete(msgs, id);
    const m = msgs[0]!;
    expect(m.status).toBe('completed');
    expect(m.content).toBe('done text');
    expect(m.timeline!.every((i) => i.kind !== 'thought' || i.ended)).toBe(true);
    expect(m.timeline!.every((i) => i.kind !== 'text' || i.ended)).toBe(true);
  });

  it('settleStreamingMessages drops empty streaming assistant and completes the rest', () => {
    const msgs: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi', status: 'completed' },
      { id: 'a0', role: 'assistant', content: '', status: 'streaming', timeline: [] },
      {
        id: 'a1',
        role: 'assistant',
        content: 'hi',
        status: 'streaming',
        timeline: [{ kind: 'text', id: 't', text: 'hi', ended: true }],
      },
    ];
    const next = settleStreamingMessages(msgs);
    expect(next.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(next[1]!.status).toBe('completed');
  });

  it('complete leaves pending AskQuestion', () => {
    const id = 'a1';
    const msgs: ChatMessage[] = [
      {
        id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [
          {
            kind: 'ask_question',
            id: 'qid',
            questions: [{ id: 'q1', prompt: 'Color?' }],
            status: 'pending',
          },
        ],
      },
    ];
    const next = applyStreamComplete(msgs, id);
    expect(next[0]!.status).toBe('completed');
    expect(next[0]!.timeline!.find((i) => i.kind === 'ask_question')).toMatchObject({
      status: 'pending',
    });
  });

  it('settleStreamingMessages freezes running tools and open thoughts', () => {
    const msgs: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [
          {
            kind: 'thought',
            id: 'th',
            text: 'hmm',
            startedAt: Date.now() - 4000,
            ended: false,
          },
          {
            kind: 'tool',
            id: 't1',
            toolName: 'bash',
            status: 'running',
            toolInput: { command: 'git push origin HEAD' },
          },
        ],
      },
    ];
    const next = settleStreamingMessages(msgs);
    const tl = next[0]!.timeline!;
    expect(next[0]!.status).toBe('completed');
    expect(tl.find((i) => i.kind === 'thought')).toMatchObject({ ended: true });
    expect(tl.find((i) => i.kind === 'tool')).toMatchObject({ status: 'done' });
  });

  it('settleStreamingMessages skips pending AskQuestion', () => {
    const msgs: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [
          {
            kind: 'ask_question',
            id: 'qid',
            questions: [{ id: 'q1', prompt: 'Color?' }],
            status: 'pending',
          },
        ],
      },
    ];
    const next = settleStreamingMessages(msgs);
    expect(next[0]!.timeline!.find((i) => i.kind === 'ask_question')).toMatchObject({
      status: 'skipped',
    });
  });

  it('AskQuestion tool result fills history answers', () => {
    const id = 'a1';
    let msgs: ChatMessage[] = [
      {
        id,
        role: 'assistant',
        content: '',
        status: 'streaming',
        timeline: [
          {
            kind: 'ask_question',
            id: 'qid',
            questions: [{ id: 'q1', prompt: 'Color?' }],
            status: 'pending',
          },
        ],
      },
    ];
    msgs = applyToolCallResult(msgs, id, {
      toolCallId: 'tool-1',
      toolName: 'AskQuestion',
      resultPreview: '[[plan_q]]{"answers":[{"questionId":"q1","customText":"blue","label":"blue"}]}',
    });
    const item = msgs[0]!.timeline!.find((i) => i.kind === 'ask_question');
    expect(item).toMatchObject({
      status: 'answered',
      answers: [expect.objectContaining({ questionId: 'q1', label: 'blue' })],
    });
  });
});
