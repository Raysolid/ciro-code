import { describe, expect, it } from 'vitest';

import type { ChatMessage } from './chat-message.js';
import {
  createTurnSessionRefs,
  finalizeTurnMessages,
  interruptLocalSlice,
  nextAttachFromSeq,
  shouldRetryAttach,
} from './turn-lifecycle.js';

describe('finalizeTurnMessages', () => {
  it('settles streaming and sets workedMs', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'hi',
        status: 'streaming',
        timeline: [{ kind: 'text', id: 't1', text: 'hi', ended: false }],
      },
    ];
    const out = finalizeTurnMessages({
      messages,
      assistantId: 'a1',
      turnStartedAt: 1000,
      now: 4500,
      stopped: false,
    });
    expect(out.workedMs).toBe(3500);
    expect(out.messages[0]?.status).toBe('completed');
  });
});

describe('interruptLocalSlice', () => {
  it('clears permission and finalizes when assistant active', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'x',
        status: 'streaming',
        timeline: [{ kind: 'text', id: 't1', text: 'x', ended: false }],
      },
    ];
    const out = interruptLocalSlice({
      messages,
      assistantId: 'a1',
      turnStartedAt: 0,
      now: 2000,
    });
    expect(out.permission).toBeNull();
    expect(out.loading).toBe(false);
    expect(out.messages[0]?.status).toBe('completed');
  });
});

describe('attach helpers', () => {
  it('shouldRetryAttach when snapshot without terminal', () => {
    expect(shouldRetryAttach({ sawTerminal: false, sawSnapshot: true, fromSeq: undefined })).toBe(
      true,
    );
    expect(shouldRetryAttach({ sawTerminal: true, sawSnapshot: true, fromSeq: 1 })).toBe(false);
  });

  it('nextAttachFromSeq prefers lastSeq+1', () => {
    const refs = createTurnSessionRefs();
    refs.lastSeq = 10;
    expect(nextAttachFromSeq(refs, 3)).toBe(11);
    refs.lastSeq = null;
    expect(nextAttachFromSeq(refs, 3)).toBe(3);
  });
});
