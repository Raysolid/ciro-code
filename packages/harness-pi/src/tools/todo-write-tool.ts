import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  policyBlockMessage,
  type PlanStore,
  type ToolPolicyGate,
} from '@ciro/harness-core';
import type { PlanRecord } from '@ciro/harness-shared';
import { makeEnvelope } from '../sse/envelope.js';
import { normalizeTodos, type PlanSsePush, type PlanToolContext } from './plan-tools.js';

export interface TodoWriteContext {
  sessionId: string;
  planStore: PlanStore;
  gate?: ToolPolicyGate;
  push?: PlanSsePush;
  getConfirmedPlanId: () => string | undefined;
  onPlanWritten?: PlanToolContext['onPlanWritten'];
  onPlanTodosSynced?: (plan: PlanRecord) => void;
}

function fail(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { error: true },
  };
}

function formatTodoLines(
  todos: ReturnType<typeof normalizeTodos>,
): string {
  if (todos.length === 0) return '(empty todo list)';
  return todos.map((t) => `- [${t.status}] ${t.id}: ${t.content}`).join('\n');
}

export function createTodoWriteTool(ctx: TodoWriteContext) {
  return defineTool({
    name: 'TodoWrite',
    label: 'Todo',
    description:
      'Replace the session todo list with the full snapshot. Use for multi-step work. At most one item in_progress. Mark completed immediately when done. After a confirmed plan, keep the same todo ids.',
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          id: Type.String(),
          content: Type.String(),
          status: Type.Union([
            Type.Literal('pending'),
            Type.Literal('in_progress'),
            Type.Literal('completed'),
            Type.Literal('cancelled'),
          ]),
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if (ctx.gate) {
          const decision = await ctx.gate(
            'TodoWrite',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const todos = normalizeTodos(params.todos);
        const planId = ctx.getConfirmedPlanId();
        if (planId) {
          const record = ctx.planStore.update(ctx.sessionId, planId, { todos });
          ctx.onPlanWritten?.({
            type: 'plan_updated',
            planId: record.planId,
            title: record.title,
          });
          ctx.push?.(
            makeEnvelope(
              'plan_updated',
              {
                planId: record.planId,
                title: record.title,
                markdown: record.markdown,
                todos: record.todos,
                confirmedAt: record.confirmedAt,
              },
              ctx.sessionId,
            ),
          );
          ctx.onPlanTodosSynced?.(record);
        }
        return {
          content: [{ type: 'text' as const, text: `Todos updated:\n${formatTodoLines(todos)}` }],
          details: { error: false, todos },
        };
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
