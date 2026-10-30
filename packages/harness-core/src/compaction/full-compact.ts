import type { CompactionResult, HarnessMode } from '@ciro-code/harness-shared';
import { roughTokenEstimate } from '../context/token-estimate.js';
import { readSessionMemory } from './session-memory.js';
import type { FullCompactSummarizer } from './full-compact-summarizer.js';
import { sliceRecentConversation } from './slice-recent.js';

export interface FullCompactInput {
  workspace: string;
  mode: HarnessMode;
  conversationText: string;
  summarizedText?: string;
  keepRecentTokens?: number;
  sessionId?: string;
  summarizer: FullCompactSummarizer;
}

export interface FullCompactOutput {
  result: CompactionResult;
  conversationText: string;
  summarizedText: string;
}

/** 确保摘要以 `# Compaction summary` 开头（模型偶发省略标题时补上） */
export function normalizeCompactionSummaryMarkdown(raw: string): string {
  const body = raw.trim();
  if (!body) {
    throw new Error('FULL_COMPACT_EMPTY: Summarizer returned empty markdown');
  }
  if (/^#\s*Compaction summary\b/i.test(body)) return body;
  return `# Compaction summary\n\n${body}`;
}

/**
 * Full compact：LLM Markdown 摘要替换早期对话，保留近期片段。
 * 锚定覆盖 previousSummary（不追加 ---）；失败由调用方熔断，无启发式兜底。
 */
export async function runFullCompact(input: FullCompactInput): Promise<FullCompactOutput> {
  const keepRecent = input.keepRecentTokens ?? 1200;
  const sm = readSessionMemory(input.workspace).trim();
  const originalTokens = roughTokenEstimate(input.conversationText);
  const keepChars = keepRecent * 4;
  const conv = input.conversationText;
  const recent = sliceRecentConversation(conv, keepChars);
  const removedEstimate = Math.max(0, conv.length - recent.length);

  const md = normalizeCompactionSummaryMarkdown(
    await input.summarizer.summarize({
      conversationText: conv,
      previousSummary: (input.summarizedText ?? '').trim() || undefined,
      sessionMemory: sm || undefined,
      sessionId: input.sessionId,
    }),
  );

  const conversationText = recent ? `## Recent conversation\n${recent}` : '';
  const summarizedText = md;
  const tokensSaved = Math.max(
    0,
    originalTokens - roughTokenEstimate(conversationText + summarizedText),
  );

  const result: CompactionResult = {
    metadata: {
      method: 'full',
      removedMessageCount:
        removedEstimate > 0 ? Math.max(1, Math.floor(removedEstimate / 200)) : 0,
      tokensSaved,
      mode: input.mode,
    },
    narrative: `Full LLM compact replaced early transcript; saved ~${tokensSaved} tokens.`,
    keyMessageIds: [],
  };

  return { result, conversationText, summarizedText };
}
