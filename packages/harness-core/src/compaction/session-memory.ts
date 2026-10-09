import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CompactionResult, HarnessMode } from '@ciro/harness-shared';
import { roughTokenEstimate } from '../context/token-estimate.js';
import {
  legacyMemoryDir,
  memoryDir,
  resolveReadable,
} from '../paths/product-paths.js';

const SESSION_MEMORY_REL = 'session-memory.md';

export function sessionMemoryPath(workspace: string): string {
  const primary = join(memoryDir(workspace), SESSION_MEMORY_REL);
  const legacy = join(legacyMemoryDir(workspace), SESSION_MEMORY_REL);
  return resolveReadable(primary, legacy).path;
}

export function readSessionMemory(workspace: string): string {
  const path = sessionMemoryPath(workspace);
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

/** 渐进笔记：每轮追加简短摘要，不打断主对话 */
export function appendSessionNote(
  workspace: string,
  note: {
    role: 'user' | 'assistant' | 'tool';
    summary: string;
    ts?: number;
  },
): void {
  const path = sessionMemoryPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, '# Session Memory\n\n', 'utf-8');
  }
  const stamp = new Date(note.ts ?? Date.now()).toISOString();
  const line = `- [${stamp}] (${note.role}) ${note.summary.trim().replace(/\s+/g, ' ').slice(0, 240)}\n`;
  writeFileSync(path, readFileSync(path, 'utf-8') + line, 'utf-8');
}

export interface SessionMemoryCompactInput {
  workspace: string;
  mode: HarnessMode;
  /** 完整对话文本（将被截断） */
  conversationText: string;
  /** 保留尾部至少这些 tokens */
  keepRecentTokens?: number;
}

export interface SessionMemoryCompactOutput {
  result: CompactionResult;
  /** 压缩后注入 conversation 的文本 */
  conversationText: string;
  /** summarized 桶文本 */
  summarizedText: string;
}

/**
 * Session-memory compact：用 session-memory.md 替换早期对话，保留近期高价值片段。
 */
export function runSessionMemoryCompact(
  input: SessionMemoryCompactInput,
): SessionMemoryCompactOutput {
  const keepRecent = input.keepRecentTokens ?? 1500;
  const sm = readSessionMemory(input.workspace).trim();
  const originalTokens = roughTokenEstimate(input.conversationText);

  // 保留尾部：按字符粗切
  const keepChars = keepRecent * 4;
  const conv = input.conversationText;
  const recent =
    conv.length <= keepChars ? conv : conv.slice(conv.length - keepChars);
  const removedEstimate = Math.max(0, conv.length - recent.length);

  const summarizedBlock = sm
    ? `## Session memory (compacted)\n\n${sm.slice(0, 6000)}`
    : '## Session memory (compacted)\n\n_(empty — notes will accumulate)_';

  const newConversation = recent
    ? `${summarizedBlock}\n\n## Recent conversation\n${recent}`
    : summarizedBlock;

  const tokensSaved = Math.max(
    0,
    originalTokens - roughTokenEstimate(newConversation),
  );

  const result: CompactionResult = {
    metadata: {
      method: 'session-memory',
      removedMessageCount: removedEstimate > 0 ? 1 : 0,
      tokensSaved,
      mode: input.mode,
    },
    narrative: `Session-memory compact replaced early transcript with notes; saved ~${tokensSaved} tokens.`,
    structured: {
      decisions: [],
      fileChanges: [],
      discoveries: [],
      todos: [],
      context: sm
        ? sm
            .split('\n')
            .filter((l) => l.startsWith('- '))
            .slice(-8)
            .map((l) => l.slice(2))
        : [],
    },
  };

  return {
    result,
    conversationText: recent,
    summarizedText: summarizedBlock,
  };
}
