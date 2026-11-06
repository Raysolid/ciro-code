import { isBackgroundTaskResultUserMessage } from '@ciro-code/harness-shared';
import type { ChatMessage } from './chat-message.js';

/** 一轮对话：用户提问 + 其后连续的助手回复（至下一条 user 前）；或单独的压缩分隔 */
export interface ChatTurn {
  id: string;
  user: ChatMessage | null;
  assistants: ChatMessage[];
  /** 压缩边界分隔条（非气泡） */
  compaction?: ChatMessage;
}

/** 将扁平消息列表按 user→assistant(s) 分组，供 sticky 用户气泡锚定 */
export function groupChatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;

  for (const m of messages) {
    if (m.role === 'compaction') {
      turns.push({ id: m.id, user: null, assistants: [], compaction: m });
      current = null;
      continue;
    }
    // 后台 Task 同轮续跑文案若误落盘为 user，不展示气泡
    if (m.role === 'user' && isBackgroundTaskResultUserMessage(m.content)) {
      continue;
    }
    if (m.role === 'user') {
      current = { id: m.id, user: m, assistants: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { id: m.id, user: null, assistants: [m] };
      turns.push(current);
    } else {
      current.assistants.push(m);
    }
  }

  return turns;
}
