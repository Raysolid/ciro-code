import { randomUUID } from 'node:crypto';
import {
  EXPLORE_TOOLS,
  parseSummarySchemaV1,
  type SummarySchemaV1,
} from '@ciro-code/harness-shared';
import type { ExploreRunner, ExploreRunInput } from '@ciro-code/harness-core';

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Mock explore：多步 thinking/tool 事件后直接返回合法 summary_schema_v1（不模拟正文 JSON）。
 */
export function createMockExploreRunner(): ExploreRunner {
  return async (input: ExploreRunInput): Promise<SummarySchemaV1> => {
    const { prompt, signal, onProgress, onEvent } = input;
    const kind = input.subagentType ?? 'explore';
    const planLabel =
      kind === 'verify'
        ? 'Planning verify…'
        : kind === 'shell'
          ? 'Planning shell…'
          : kind === 'browser'
            ? 'Planning browser…'
            : 'Planning explore…';
    onEvent({ type: 'thinking', delta: planLabel });
    onProgress(planLabel);
    await sleep(200, signal);

    const toolCallId = randomUUID();
    if (kind === 'browser') {
      onEvent({
        type: 'tool_call_start',
        toolCallId,
        toolName: 'mcp:playwright:browser_navigate',
        toolInput: { url: 'https://example.com' },
      });
      onProgress('Navigating https://example.com');
      await sleep(200, signal);
      onEvent({
        type: 'tool_call_result',
        toolCallId,
        toolName: 'mcp:playwright:browser_navigate',
        resultPreview: 'ok',
        isError: false,
      });
      const snapId = randomUUID();
      onEvent({
        type: 'tool_call_start',
        toolCallId: snapId,
        toolName: 'mcp:playwright:browser_snapshot',
        toolInput: {},
      });
      onProgress('Capturing page snapshot…');
      await sleep(200, signal);
      onEvent({
        type: 'tool_call_result',
        toolCallId: snapId,
        toolName: 'mcp:playwright:browser_snapshot',
        resultPreview: '- heading "Example Domain"\n- paragraph (truncated mock snapshot)',
        isError: false,
      });
    } else {
      onEvent({
        type: 'tool_call_start',
        toolCallId,
        toolName: 'grep',
        toolInput: { pattern: prompt.slice(0, 40), path: '.' },
      });
      onProgress('Grepping workspace…');
      await sleep(250, signal);

      onEvent({
        type: 'tool_call_result',
        toolCallId,
        toolName: 'grep',
        resultPreview: 'mock-match: src/example.ts:1',
        isError: false,
      });
    }
    await sleep(150, signal);

    onEvent({
      type: 'token',
      delta: 'Gathered enough signal to summarize.\n\n',
    });
    onProgress('Writing summary…');
    await sleep(200, signal);

    const summary: SummarySchemaV1 =
      kind === 'browser'
        ? {
            conclusion: `Mock browser for: ${prompt.trim().slice(0, 120) || 'brief'}. Opened example.com and captured a snapshot.`,
            paths: ['https://example.com'],
            symbols: ['Example Domain'],
            openQuestions: ['Need a real Playwright MCP for live pages'],
            confidence: 'medium',
          }
        : {
            conclusion: `Mock ${kind} for: ${prompt.trim().slice(0, 120) || 'brief'}. Found illustrative paths and symbols for UI streaming.`,
            paths: ['src/example.ts', 'README.md', 'package.json'],
            symbols: EXPLORE_TOOLS.slice(0, 3) as unknown as string[],
            openQuestions: ['Confirm whether deeper package-level reads are needed'],
            confidence: 'medium',
          };
    // ensure parseable
    if (!parseSummarySchemaV1(summary)) {
      throw new Error('Mock explore produced invalid summary_schema_v1');
    }
    return summary;
  };
}
