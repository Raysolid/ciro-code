import type { ModelRef } from '@ciro-code/harness-shared';
import type { FullCompactSummarizer, ProviderStore } from '@ciro-code/harness-core';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { resolvePiModel } from './resolve-pi-model.js';

/** 输入硬截上限（字符）；头 30% + 尾，避免引入第二套 tokenizer */
const MAX_INPUT_CHARS = 120_000;

const SYSTEM_PROMPT = `You are a context compaction summarizer for a coding agent.
Respond with TEXT ONLY. Do NOT call tools. Do NOT wrap the answer in code fences.

Output a single Markdown document that starts with exactly:
# Compaction summary

Then include these sections (use ## headings; omit a section only if truly empty):
## Primary Request and Intent
## Key Technical Concepts
## Files and Code Sections
## Errors and Fixes
## All User Messages
## Pending Tasks
## Current Work
## Optional Next Step

Rules:
- Prefer terse bullets; keep exact file paths and identifiers.
- Capture the user's latest explicit intent and what work was in progress.
- If a previous summary is provided, UPDATE that anchored summary: keep still-true facts, drop stale ones, merge new facts. Do NOT append a second summary with --- separators.
- Language: match the conversation (Chinese if the user wrote Chinese).`;

function clipHeadTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.3);
  const tail = max - head - 40;
  return `${text.slice(0, head)}\n\n…[truncated for compaction]…\n\n${text.slice(-Math.max(0, tail))}`;
}

function assistantText(content: Array<{ type?: string; text?: string }>): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('');
}

export interface PiFullCompactSummarizerDeps {
  getModelRuntime: () => Promise<ModelRuntime>;
  providerStore: ProviderStore | undefined;
  /** 按 session 取当前 preferred model；无则用全局默认 */
  getPreferredModelRef: (sessionId: string | undefined) => ModelRef | null | undefined;
}

export function createPiFullCompactSummarizer(
  deps: PiFullCompactSummarizerDeps,
): FullCompactSummarizer {
  return {
    async summarize(input) {
      if (!deps.providerStore) {
        throw new Error('FULL_COMPACT_NO_PROVIDER: ProviderStore required for LLM full compact');
      }
      const modelRuntime = await deps.getModelRuntime();
      const preferred = deps.getPreferredModelRef(input.sessionId) ?? null;
      const resolved = await resolvePiModel(modelRuntime, deps.providerStore, preferred);
      if (!resolved) {
        throw new Error('FULL_COMPACT_NO_MODEL: No usable model for full compact');
      }

      const conversation = clipHeadTail(input.conversationText, MAX_INPUT_CHARS);
      const prev = input.previousSummary
        ? clipHeadTail(input.previousSummary, Math.floor(MAX_INPUT_CHARS / 4))
        : '';
      const memory = input.sessionMemory
        ? clipHeadTail(input.sessionMemory, 8_000)
        : '';

      const userParts = [
        prev
          ? `## Previous anchored summary (update in place)\n\n${prev}`
          : '## Previous anchored summary\n\n_(none — create a new summary)_',
        memory ? `## Session memory notes\n\n${memory}` : '',
        `## Conversation to compact\n\n${conversation}`,
        'End of conversation history. Output only the # Compaction summary Markdown document.',
      ].filter(Boolean);

      const assistant = await modelRuntime.completeSimple(resolved.model, {
        systemPrompt: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userParts.join('\n\n'),
            timestamp: Date.now(),
          },
        ],
      });

      if (assistant.stopReason === 'error' || assistant.stopReason === 'aborted') {
        throw new Error(
          `FULL_COMPACT_LLM_ERROR: ${assistant.errorMessage ?? assistant.stopReason}`,
        );
      }
      const text = assistantText(assistant.content).trim();
      if (!text) {
        throw new Error('FULL_COMPACT_EMPTY: Model returned empty summary');
      }
      return text;
    },
  };
}
