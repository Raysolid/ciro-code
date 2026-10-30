import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  ToolResultStore,
  capToolResultContent,
  isPolicyBlocked,
  policyBlockMessage,
  searchTranscriptSessionDir,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';

export function createSearchTranscriptTool(sessionDir: string, gate?: ToolPolicyGate) {
  return defineTool({
    name: 'search_transcript',
    label: 'Search Transcript',
    description:
      'Search this session transcript (events.jsonl) for past user/assistant messages, tool calls, or compaction notes. Use after context compaction when details are missing from the live prompt. Does not search the workspace — use grep for files.',
    parameters: Type.Object({
      query: Type.String({ description: 'Case-insensitive substring to find' }),
      limit: Type.Optional(Type.Number({ description: 'Max hits (default 20)' })),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, hits: 0 },
      });
      try {
        if (gate) {
          const decision = await gate(
            'search_transcript',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const hits = searchTranscriptSessionDir(sessionDir, params.query, {
          limit: params.limit,
        });
        if (hits.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No transcript matches.' }],
            details: { error: false, hits: 0 },
          };
        }
        const lines = hits.map((h, i) => {
          const ids = [
            h.messageId ? `messageId=${h.messageId}` : '',
            h.toolCallId ? `toolCallId=${h.toolCallId}` : '',
            h.toolName ? `tool=${h.toolName}` : '',
            h.role ? `role=${h.role}` : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `[${i + 1}] ts=${h.ts} type=${h.type}${ids ? ` ${ids}` : ''}\n${h.snippet}`;
        });
        return {
          content: [{ type: 'text' as const, text: lines.join('\n---\n') }],
          details: { error: false, hits: hits.length },
        };
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });
}

export function createGetToolResultTool(sessionDir: string, gate?: ToolPolicyGate) {
  return defineTool({
    name: 'get_tool_result',
    label: 'Get Tool Result',
    description:
      'Fetch the full stored output of a prior tool call by toolCallId (from search_transcript or the UI). Use when micro-compaction externalized a result to disk and only a preview remains in context.',
    parameters: Type.Object({
      toolCallId: Type.String({ description: 'Tool call id from transcript / tool_call event' }),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true },
      });
      try {
        if (gate) {
          const decision = await gate(
            'get_tool_result',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const stored = new ToolResultStore(sessionDir).read(params.toolCallId);
        if (!stored) {
          return fail(`Tool result not found: ${params.toolCallId}`);
        }
        const body = stored.content || stored.preview || '';
        const text = capToolResultContent(body);
        const header = `toolCallId=${stored.toolCallId} toolName=${stored.toolName} retention=${stored.retention}`;
        return {
          content: [{ type: 'text' as const, text: `${header}\n\n${text}` }],
          details: {
            error: false,
            toolCallId: stored.toolCallId,
            toolName: stored.toolName,
            truncated: text.length < body.length,
          },
        };
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });
}
