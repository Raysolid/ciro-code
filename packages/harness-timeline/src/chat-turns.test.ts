import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import { groupChatTurns } from './chat-turns.js';

function msg(
  partial: Pick<ChatMessage, 'id' | 'role'> & Partial<ChatMessage>,
): ChatMessage {
  return {
    content: '',
    status: 'completed',
    ...partial,
  };
}

describe('groupChatTurns', () => {
  it('groups user with following assistants', () => {
    const turns = groupChatTurns([
      msg({ id: 'u1', role: 'user', content: 'hi' }),
      msg({ id: 'a1', role: 'assistant', content: 'yo' }),
      msg({ id: 'a2', role: 'assistant', content: 'more' }),
      msg({ id: 'u2', role: 'user', content: 'next' }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.user?.id).toBe('u1');
    expect(turns[0]?.assistants.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(turns[1]?.user?.id).toBe('u2');
  });

  it('inserts compaction as its own turn separator', () => {
    const turns = groupChatTurns([
      msg({ id: 'u1', role: 'user', content: 'hi' }),
      msg({ id: 'a1', role: 'assistant', content: 'yo' }),
      msg({
        id: 'c1',
        role: 'compaction',
        compaction: { method: 'session-memory', tokensSaved: 100 },
      }),
      msg({ id: 'u2', role: 'user', content: 'next' }),
    ]);
    expect(turns).toHaveLength(3);
    expect(turns[1]?.compaction?.id).toBe('c1');
    expect(turns[2]?.user?.id).toBe('u2');
  });
});
