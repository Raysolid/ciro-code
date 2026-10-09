import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  policyBlockMessage,
  type SubagentOrchestrator,
  type ToolPolicyGate,
} from '@ciro/harness-core';
import {
  BROWSER_MCP_NOT_READY_MESSAGE,
  isSubagentType,
  type SseEnvelope,
} from '@ciro/harness-shared';

function fail(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { error: true },
  };
}

export interface TaskToolContext {
  sessionId: string;
  workspace: string;
  orchestrator: SubagentOrchestrator;
  gate?: ToolPolicyGate;
  push?: (envelope: SseEnvelope) => void;
  /** 子循环 depth；父调用为 0 */
  getSubagentDepth?: () => number;
  /** 同步终态：计入 context 桶；后台早返回勿调 */
  onResult?: (result: {
    ok: boolean;
    toolResultText: string;
    summary?: import('@ciro/harness-shared').SummarySchemaV1;
  }) => void;
  /** 后台启动：登记本 turn 待收束 taskId */
  onBackgroundStarted?: (taskId: string) => void;
  /** 后台终态：入队同轮续跑 */
  onBackgroundSettled?: (result: import('@ciro/harness-core').TaskExploreResult) => void;
  /**
   * 能力闸门：为 true 时 schema 含 browser。
   * 缺省 false（不向模型暴露）。
   */
  includeBrowser?: boolean;
  /** 执行期二次校验；缺省与 includeBrowser 相同语义 */
  isBrowserAvailable?: () => boolean;
}

function buildSubagentTypeSchema(includeBrowser: boolean) {
  const base = [
    Type.Literal('explore'),
    Type.Literal('verify'),
    Type.Literal('shell'),
  ] as const;
  const literals = includeBrowser
    ? [...base, Type.Literal('browser')]
    : [...base];
  const description = includeBrowser
    ? 'explore = readonly search; verify = run tests / confirm a fix; shell = isolated Agent-level bash; browser = Playwright MCP navigation/click/snapshot (requires playwright MCP)'
    : 'explore = readonly search; verify = run tests / confirm a fix; shell = isolated Agent-level bash';
  return Type.Union(literals, { description });
}

function taskDescription(includeBrowser: boolean): string {
  const browserClause = includeBrowser
    ? ' browser: multi-step page interaction via Playwright MCP (summary only to parent).'
    : '';
  return (
    'Delegate a short-lived explore, verify, or shell subagent.' +
    ' explore: broad readonly codebase search. verify: run tests / check a claimed fix (test bash allowed, no write/edit tools).' +
    ' shell: Agent-level bash in isolation (no write/edit tools).' +
    browserClause +
    ' Do NOT use for narrow single-file questions. The subagent cannot see parent chat history.' +
    ' Default awaits summary_schema_v1. Set run_in_background=true to keep working in the same turn while the subagent runs;' +
    ' when it finishes, the summary is injected and you continue in the same turn (no new user message).'
  );
}

export function createTaskTool(ctx: TaskToolContext) {
  const includeBrowser = ctx.includeBrowser === true;
  const browserReady = () =>
    ctx.isBrowserAvailable ? ctx.isBrowserAvailable() : includeBrowser;

  return defineTool({
    name: 'Task',
    label: 'Task',
    description: taskDescription(includeBrowser),
    parameters: Type.Object({
      subagent_type: buildSubagentTypeSchema(includeBrowser),
      prompt: Type.String({
        description: 'Self-contained brief for the subagent (no parent history)',
      }),
      title: Type.Optional(
        Type.String({ description: 'Short UI title for the task card' }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description:
            'If true, return immediately with status running; summary is injected in the same turn when the subagent finishes. Omit/false when you need the result before continuing.',
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if ((ctx.getSubagentDepth?.() ?? 0) >= 1) {
          return fail('Nested Task is denied (maxDepth=1)');
        }
        if (ctx.gate) {
          const decision = await ctx.gate(
            'Task',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }

        const subagentType = String(params.subagent_type ?? '');
        if (!isSubagentType(subagentType)) {
          return fail(`Unsupported subagent_type: ${subagentType}`);
        }
        if (subagentType === 'browser' && !browserReady()) {
          return fail(BROWSER_MCP_NOT_READY_MESSAGE);
        }
        const prompt = String(params.prompt ?? '').trim();
        if (!prompt) return fail('prompt is required');

        const background = params.run_in_background === true;

        const result = await ctx.orchestrator.runExplore({
          parentSessionId: ctx.sessionId,
          workspace: ctx.workspace,
          prompt,
          title: params.title ? String(params.title) : undefined,
          subagentType,
          push: ctx.push,
          background,
          onSettled: background ? ctx.onBackgroundSettled : undefined,
        });

        if (result.status === 'running') {
          if (result.taskId) ctx.onBackgroundStarted?.(result.taskId);
        } else {
          ctx.onResult?.({
            ok: result.ok,
            toolResultText: result.toolResultText,
            summary: result.summary,
          });
        }

        return {
          content: [{ type: 'text' as const, text: result.toolResultText }],
          details: {
            error: result.status === 'failed' || result.status === 'stopped',
            taskId: result.taskId,
            status: result.status,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return fail(message);
      }
    },
  });
}
