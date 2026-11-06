import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import {
  contentFromTimeline,
  upsertAskQuestion,
  upsertTextDelta,
  upsertThoughtDelta,
  upsertToolResult,
  upsertToolStart,
} from './message-timeline.js';

function assistant(id = 'a1'): ChatMessage[] {
  return [{ id, role: 'assistant', content: '', status: 'streaming', timeline: [] }];
}

describe('message-timeline interleaved parts', () => {
  it('thinking → token → tool → token → tool → token keeps order and content', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertThoughtDelta(msgs, id, 'plan…', 1000);
    msgs = upsertTextDelta(msgs, id, '先看结构。', 2000);
    msgs = upsertToolStart(msgs, id, {
      toolCallId: 't1',
      toolName: 'read',
      toolInput: { path: 'README.md' },
    });
    msgs = upsertToolResult(msgs, id, { toolCallId: 't1', resultPreview: 'ok' });
    msgs = upsertTextDelta(msgs, id, '再看源码。', 3000);
    msgs = upsertToolStart(msgs, id, {
      toolCallId: 't2',
      toolName: 'list_files',
      toolInput: { path: 'src' },
    });
    msgs = upsertToolResult(msgs, id, { toolCallId: 't2' });
    msgs = upsertTextDelta(msgs, id, '完成简介。', 4000);

    const m = msgs[0]!;
    const kinds = (m.timeline ?? []).map((i) => i.kind);
    expect(kinds).toEqual(['thought', 'text', 'tool', 'text', 'tool', 'text']);
    expect(m.content).toBe('先看结构。再看源码。完成简介。');
    expect(contentFromTimeline(m.timeline)).toBe(m.content);

    const texts = (m.timeline ?? []).filter((i) => i.kind === 'text');
    expect(texts).toHaveLength(3);
    expect(texts[0]).toMatchObject({ text: '先看结构。', ended: true });
    expect(texts[1]).toMatchObject({ text: '再看源码。', ended: true });
    expect(texts[2]).toMatchObject({ text: '完成简介。' });
    expect((texts[2] as { ended?: boolean }).ended).toBeFalsy();
  });

  it('continues open text segment across token deltas', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertTextDelta(msgs, id, 'Hello', 1);
    msgs = upsertTextDelta(msgs, id, ' world', 2);
    const m = msgs[0]!;
    expect(m.timeline).toHaveLength(1);
    expect(m.timeline![0]).toMatchObject({ kind: 'text', text: 'Hello world' });
    expect(m.content).toBe('Hello world');
  });

  it('keeps other message object identity when upserting one assistant (O2)', () => {
    const user: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: 'hi',
      status: 'completed',
    };
    const hist: ChatMessage = {
      id: 'a0',
      role: 'assistant',
      content: 'old',
      status: 'completed',
      timeline: [{ kind: 'text', id: 't0', text: 'old', ended: true }],
    };
    const live: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      timeline: [],
    };
    let msgs = [user, hist, live];
    msgs = upsertTextDelta(msgs, 'a1', 'x', 1);
    expect(msgs[0]).toBe(user);
    expect(msgs[1]).toBe(hist);
    expect(msgs[2]).not.toBe(live);
    expect(msgs[2]!.content).toBe('x');
  });

  it('AskQuestion closes prior text so later tokens stay after the card', () => {
    const id = 'a1';
    let msgs = assistant(id);
    msgs = upsertTextDelta(msgs, id, '先确认一个关键点：', 1);
    msgs = upsertAskQuestion(msgs, id, {
      questionId: 'q1',
      questions: [{ id: 'q-a', prompt: '范围？', options: [] }],
    });
    msgs = upsertTextDelta(msgs, id, '已确认需求。', 2);
    const kinds = (msgs[0]!.timeline ?? []).map((i) => i.kind);
    expect(kinds).toEqual(['text', 'ask_question', 'text']);
    const texts = (msgs[0]!.timeline ?? []).filter((i) => i.kind === 'text');
    expect(texts[0]).toMatchObject({ text: '先确认一个关键点：', ended: true });
    expect(texts[1]).toMatchObject({ text: '已确认需求。' });
  });

  it('duplicate AskQuestion does not close text after the card', () => {
    const id = 'a1';
    const q = { questionId: 'q1', questions: [{ id: 'q-a', prompt: '范围？' }] };
    let msgs = assistant(id);
    msgs = upsertTextDelta(msgs, id, '先确认。', 1);
    msgs = upsertAskQuestion(msgs, id, q);
    msgs = upsertTextDelta(msgs, id, '已确认。', 2);
    msgs = upsertAskQuestion(msgs, id, q);
    const texts = (msgs[0]!.timeline ?? []).filter((i) => i.kind === 'text');
    expect(texts).toHaveLength(2);
    expect(texts[1]).toMatchObject({ text: '已确认。' });
    expect((texts[1] as { ended?: boolean }).ended).toBeFalsy();
  });
});
