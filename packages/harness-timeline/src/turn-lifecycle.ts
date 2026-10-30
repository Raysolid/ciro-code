import type { ChatMessage } from './chat-message.js';
import { setWorkedFor, updateMessage } from './message-timeline.js';
import { settleStreamingMessages } from './stream-event-messages.js';

/** 会话级 turn 水位 / 飞行态（双端共用字段约定） */
export interface TurnSessionRefs {
  lastSeq: number | null;
  turnEpoch: number;
  turnInFlight: boolean;
  turnStartedAt: number | null;
  activeAssistantId: string | null;
}

export function createTurnSessionRefs(): TurnSessionRefs {
  return {
    lastSeq: null,
    turnEpoch: 0,
    turnInFlight: false,
    turnStartedAt: null,
    activeAssistantId: null,
  };
}

export interface FinalizeTurnInput {
  messages: ChatMessage[];
  assistantId: string;
  /** 本轮开始墙钟；null 则不算 workedMs */
  turnStartedAt: number | null;
  now: number;
  stopped?: boolean;
}

export interface FinalizeTurnResult {
  messages: ChatMessage[];
  workedMs: number | null;
}

/** 纯函数：结算 streaming + Worked for（对应 hook finalizeTurn 的消息变换） */
export function finalizeTurnMessages(input: FinalizeTurnInput): FinalizeTurnResult {
  const { assistantId, turnStartedAt, now, stopped = false } = input;
  let messages = settleStreamingMessages(input.messages);
  const workedMs =
    turnStartedAt != null ? Math.max(0, now - turnStartedAt) : null;
  if (workedMs != null) {
    messages = setWorkedFor(
      updateMessage(messages, assistantId, (m) => ({ ...m, workedMs })),
      assistantId,
      workedMs,
      stopped,
    );
  }
  return { messages, workedMs };
}

/** interrupt 本地收尾：清 permission / loading，可选 finalize */
export function interruptLocalSlice(input: {
  messages: ChatMessage[];
  assistantId: string | null;
  turnStartedAt: number | null;
  now: number;
}): { messages: ChatMessage[]; permission: null; loading: false } {
  if (input.assistantId) {
    const { messages } = finalizeTurnMessages({
      messages: input.messages,
      assistantId: input.assistantId,
      turnStartedAt: input.turnStartedAt,
      now: input.now,
      stopped: true,
    });
    return { messages, permission: null, loading: false };
  }
  return {
    messages: settleStreamingMessages(input.messages),
    permission: null,
    loading: false,
  };
}

/**
 * attach 追赶：是否在首轮未看到 terminal 时再试一次。
 * （HTTP / attachChat 仍由胶水执行）
 */
export function shouldRetryAttach(input: {
  sawTerminal: boolean;
  sawSnapshot: boolean;
  fromSeq: number | undefined;
}): boolean {
  if (input.sawTerminal) return false;
  return input.sawSnapshot || input.fromSeq != null;
}

export function nextAttachFromSeq(refs: TurnSessionRefs, fallback?: number): number | undefined {
  return refs.lastSeq != null ? refs.lastSeq + 1 : fallback;
}
