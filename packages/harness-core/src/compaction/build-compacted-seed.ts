import type { CompactionMethod } from '@ciro-code/harness-shared';

/** Pi 文本级种子消息（与 harness-pi SeedChatMessage 角色对齐） */
export interface CompactedSeedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BuildCompactedSeedInput {
  method?: CompactionMethod;
  summarizedText?: string;
  conversationText?: string;
  /** micro 或无摘要时：UI 文本消息（忽略 timeline/tool；compaction 标记不入种子） */
  uiMessages?: Array<{ role: 'user' | 'assistant' | 'compaction'; content: string }>;
}

/**
 * 将会计侧 conversation 文本（`User:` / `Assistant:` 行约定）解析为种子消息。
 * 非角色行（如 `## Recent conversation`）在尚未进入角色块时跳过。
 */
export function parseConversationText(text: string): CompactedSeedMessage[] {
  const out: CompactedSeedMessage[] = [];
  let role: 'user' | 'assistant' | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (!role) return;
    const content = buf.join('\n').trim();
    if (content) out.push({ role, content });
    role = null;
    buf = [];
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('User:')) {
      flush();
      role = 'user';
      buf = [line.slice('User:'.length).replace(/^\s*/, '')];
      continue;
    }
    if (line.startsWith('Assistant:')) {
      flush();
      role = 'assistant';
      buf = [line.slice('Assistant:'.length).replace(/^\s*/, '')];
      continue;
    }
    if (role) buf.push(line);
  }
  flush();
  return out;
}

function uiMessagesToSeed(
  uiMessages: Array<{ role: 'user' | 'assistant' | 'compaction'; content: string }>,
): CompactedSeedMessage[] {
  const out: CompactedSeedMessage[] = [];
  for (const m of uiMessages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = m.content.trim();
    if (!content) continue;
    out.push({ role: m.role, content });
  }
  return out;
}

function summarySeedMessage(summarizedText: string): CompactedSeedMessage {
  const body = summarizedText.trim();
  const content = body.startsWith('#') ? body : `# Compaction summary\n\n${body}`;
  return { role: 'user', content };
}

/**
 * 构建送入 Pi 的压缩后文本历史。
 * - 有 summarized（或 method 为 SM/full）→ summary 首条 + conversation 解析
 * - 否则（micro）→ UI 文本消息（不回放 tool）
 */
export function buildCompactedSeedMessages(
  input: BuildCompactedSeedInput,
): CompactedSeedMessage[] {
  const summarized = (input.summarizedText ?? '').trim();
  const method = input.method;
  const useSummarizedPath =
    summarized.length > 0 ||
    method === 'session-memory' ||
    method === 'full';

  if (useSummarizedPath) {
    const out: CompactedSeedMessage[] = [];
    if (summarized) out.push(summarySeedMessage(summarized));
    const recent = parseConversationText(input.conversationText ?? '');
    out.push(...recent);
    return out;
  }

  return uiMessagesToSeed(input.uiMessages ?? []);
}
