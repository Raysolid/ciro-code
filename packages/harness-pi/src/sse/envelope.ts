import type { SseEnvelope } from '@ciro/harness-shared';

export function makeEnvelope<T>(
  type: string,
  payload: T,
  sessionId?: string,
  messageId?: string,
): SseEnvelope<T> {
  return {
    type,
    ts: Date.now(),
    conversationId: sessionId,
    messageId,
    payload,
  };
}
