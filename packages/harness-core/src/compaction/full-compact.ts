import type { CompactionResult, HarnessMode } from '@ciro-code/harness-shared';
import { roughTokenEstimate } from '../context/token-estimate.js';
import { readSessionMemory } from './session-memory.js';

export interface FullCompactInput {
  workspace: string;
  mode: HarnessMode;
  conversationText: string;
  summarizedText?: string;
  keepRecentTokens?: number;
}

export interface FullCompactOutput {
  result: CompactionResult;
  conversationText: string;
  summarizedText: string;
}

/** 将结构化 compact 结果格式化为可注入 Markdown */
export function formatCompactionMarkdown(result: CompactionResult): string {
  const s = result.structured;
  const lines: string[] = ['# Compaction summary', ''];
  if (result.narrative) {
    lines.push(result.narrative, '');
  }
  if (s?.decisions?.length) {
    lines.push('## Decisions');
    for (const d of s.decisions) {
      lines.push(`- ${d.content}${d.reasoning ? ` _( ${d.reasoning})_` : ''}`);
    }
    lines.push('');
  }
  if (s?.fileChanges?.length) {
    lines.push('## File Changes');
    for (const f of s.fileChanges) {
      lines.push(`- \`${f.path}\` (${f.operation}): ${f.summary}`);
    }
    lines.push('');
  }
  if (s?.discoveries?.length) {
    lines.push('## Discoveries');
    for (const d of s.discoveries) {
      lines.push(`- [${d.type}] ${d.content}`);
    }
    lines.push('');
  }
  if (s?.todos?.length) {
    lines.push('## Todos');
    for (const t of s.todos) {
      lines.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.content}`);
    }
    lines.push('');
  }
  if (s?.context?.length) {
    lines.push('## Context');
    for (const c of s.context) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function extractStructured(
  conversation: string,
  sessionMemory: string,
): NonNullable<CompactionResult['structured']> {
  const decisions: NonNullable<CompactionResult['structured']>['decisions'] = [];
  const fileChanges: NonNullable<CompactionResult['structured']>['fileChanges'] = [];
  const discoveries: NonNullable<CompactionResult['structured']>['discoveries'] = [];
  const todos: NonNullable<CompactionResult['structured']>['todos'] = [];
  const context: string[] = [];

  const lines = `${sessionMemory}\n${conversation}`.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const todoMatch = line.match(/^-?\s*\[\s*([ xX])\s*\]\s+(.+)$/) || line.match(/^TODO:\s*(.+)$/i);
    if (todoMatch) {
      const done = todoMatch[1] === 'x' || todoMatch[1] === 'X';
      const content = (todoMatch[2] ?? todoMatch[1] ?? '').trim();
      if (content) todos.push({ content, status: done ? 'done' : 'pending' });
      continue;
    }

    if (/\b(decid(?:ed|e)|chose|will use|采用|决定)\b/i.test(line)) {
      decisions.push({ content: line.replace(/^[-*]\s*/, '').slice(0, 240) });
      continue;
    }

    const fileMatch = line.match(
      /(?:wrote|write|edit(?:ed)?|created|updated|modified)\s+[`']?([^\s`'"]+\.[a-zA-Z0-9]+)[`']?/i,
    );
    if (fileMatch) {
      fileChanges.push({
        path: fileMatch[1]!,
        operation: /edit/i.test(line) ? 'edit' : /creat/i.test(line) ? 'create' : 'write',
        summary: line.slice(0, 160),
      });
      continue;
    }

    if (/\b(found|discover(?:ed|y)|note:|发现)\b/i.test(line)) {
      discoveries.push({ type: 'note', content: line.replace(/^[-*]\s*/, '').slice(0, 240) });
      continue;
    }

    if (line.startsWith('- [') || line.startsWith('- (')) {
      context.push(line.replace(/^[-*]\s*/, '').slice(0, 200));
    }
  }

  return {
    decisions: decisions.slice(0, 12),
    fileChanges: fileChanges.slice(0, 20),
    discoveries: discoveries.slice(0, 12),
    todos: todos.slice(0, 20),
    context: context.slice(-12),
  };
}

/**
 * Full 结构化 compact（Phase 2：启发式抽取，不依赖 LLM）。
 * 用结构化 Markdown 替换早期对话，保留近期片段。
 */
export function runFullCompact(input: FullCompactInput): FullCompactOutput {
  const keepRecent = input.keepRecentTokens ?? 1200;
  const sm = readSessionMemory(input.workspace).trim();
  const originalTokens = roughTokenEstimate(input.conversationText);
  const keepChars = keepRecent * 4;
  const conv = input.conversationText;
  const recent = conv.length <= keepChars ? conv : conv.slice(conv.length - keepChars);
  const removedEstimate = Math.max(0, conv.length - recent.length);

  const structured = extractStructured(conv, sm);
  const result: CompactionResult = {
    metadata: {
      method: 'full',
      removedMessageCount: removedEstimate > 0 ? Math.max(1, Math.floor(removedEstimate / 200)) : 0,
      tokensSaved: 0,
      mode: input.mode,
    },
    structured,
    narrative: `Full structured compact extracted ${structured.decisions.length} decisions, ${structured.fileChanges.length} file changes, ${structured.todos.length} todos.`,
    keyMessageIds: [],
  };

  const md = formatCompactionMarkdown(result);
  const prevSummarized = (input.summarizedText ?? '').trim();
  const summarizedText = prevSummarized
    ? `${prevSummarized}\n\n---\n\n${md}`
    : md;

  const conversationText = recent
    ? `## Recent conversation\n${recent}`
    : '';

  result.metadata.tokensSaved = Math.max(
    0,
    originalTokens - roughTokenEstimate(conversationText + summarizedText),
  );
  result.narrative += ` Saved ~${result.metadata.tokensSaved} tokens.`;

  return { result, conversationText, summarizedText };
}
