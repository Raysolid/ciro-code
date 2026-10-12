import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  PlanQuestionBroker,
  normalizePlanQuestions,
  policyBlockMessage,
  type PlanQuestionDecision,
  type PlanStore,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';
import type {
  PlanQuestionAnswer,
  PlanQuestionItem,
  PlanTodoItem,
  SseEnvelope,
} from '@ciro-code/harness-shared';
import { makeEnvelope } from '../sse/envelope.js';

function fail(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { error: true },
  };
}

export type PlanSsePush = (envelope: SseEnvelope) => void;

export interface PlanToolContext {
  sessionId: string;
  planStore: PlanStore;
  gate?: ToolPolicyGate;
  push?: PlanSsePush;
  questionsBroker?: PlanQuestionBroker;
  /** 写入后回调（更新 meta / events） */
  onPlanWritten?: (event: {
    type: 'plan_created' | 'plan_updated';
    planId: string;
    title: string;
  }) => void;
}

const questionItem = Type.Object({
  id: Type.String({ description: 'Stable question id' }),
  prompt: Type.String({ description: 'Question text for the user' }),
  options: Type.Optional(
    Type.Array(
      Type.Object({
        id: Type.String(),
        label: Type.String(),
      }),
    ),
  ),
  allowMultiple: Type.Optional(Type.Boolean()),
});

function answerDisplay(q: PlanQuestionItem, a: PlanQuestionAnswer | undefined): string {
  if (a?.label?.trim()) return a.label.trim();
  const labels = (a?.optionIds ?? []).map(
    (id) => q.options?.find((o) => o.id === id)?.label ?? id,
  );
  if (a?.customText?.trim()) labels.push(a.customText.trim());
  return labels.filter(Boolean).join('; ');
}

function formatAskQuestionResult(
  questions: PlanQuestionItem[],
  decision: PlanQuestionDecision,
): string {
  if (decision.skipped) {
    return (
      '[[plan_q:skip]]\nUser skipped the clarifying questions. Continue with reasonable assumptions; do not re-ask the same questions.'
    );
  }
  const raw = decision.answers ?? [];
  const answers = questions.map((q, i) => {
    const a = raw.find((x) => x.questionId === q.id) ?? raw[i];
    const label = answerDisplay(q, a);
    return {
      questionId: q.id,
      optionIds: a?.optionIds ?? [],
      customText: a?.customText,
      label: label || undefined,
    };
  });
  const body = questions
    .map((q, i) => `${i + 1}. ${q.prompt}\n   ${answers[i]?.label || '(no answer)'}`)
    .join('\n');
  return `[[plan_q]]${JSON.stringify({ answers })}\nUser answers:\n${body}\nProceed with these answers. Do not re-ask unless something new is blocking.`;
}

export function createAskQuestionTool(ctx: PlanToolContext) {
  return defineTool({
    name: 'AskQuestion',
    label: 'Ask Question',
    description:
      'Ask the user 1–5 clarifying questions with optional choices. Blocks until the user answers or skips. Use in Plan mode when requirements are ambiguous.',
    parameters: Type.Object({
      questions: Type.Array(questionItem, {
        minItems: 1,
        maxItems: 5,
        description: 'One to five critical questions',
      }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if (ctx.gate) {
          const decision = await ctx.gate(
            'AskQuestion',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const questions = normalizePlanQuestions(params.questions as PlanQuestionItem[]);
        if (!ctx.questionsBroker) {
          ctx.push?.(makeEnvelope('plan_question', { questions }, ctx.sessionId));
          return fail('AskQuestion broker is not configured');
        }
        const { decision } = await ctx.questionsBroker.requestAnswers({
          sessionId: ctx.sessionId,
          questions,
        });
        return {
          content: [{ type: 'text' as const, text: formatAskQuestionResult(questions, decision) }],
          details: {
            error: false,
            skipped: Boolean(decision.skipped),
            answers: decision.skipped ? undefined : decision.answers,
          },
        };
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}

export function normalizeTodos(raw: unknown): PlanTodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const item = t as Record<string, unknown>;
    const status = item.status;
    const ok =
      status === 'pending' ||
      status === 'in_progress' ||
      status === 'completed' ||
      status === 'cancelled'
        ? status
        : 'pending';
    return {
      id: String(item.id ?? `t${i + 1}`),
      content: String(item.content ?? ''),
      status: ok,
    };
  });
}

export function createCreatePlanTool(ctx: PlanToolContext) {
  return defineTool({
    name: 'CreatePlan',
    label: 'Create Plan',
    description:
      'Present an executable plan for user confirmation (alias: propose_plan). Do not edit files before the user confirms.',
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: 'Short plan title' })),
      plan: Type.String({ description: 'Markdown plan body' }),
      todos: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String(),
            content: Type.String(),
            status: Type.Optional(
              Type.Union([
                Type.Literal('pending'),
                Type.Literal('in_progress'),
                Type.Literal('completed'),
                Type.Literal('cancelled'),
              ]),
            ),
          }),
        ),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if (ctx.gate) {
          const decision = await ctx.gate(
            'CreatePlan',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const record = ctx.planStore.create(ctx.sessionId, {
          title: params.title,
          markdown: params.plan,
          todos: normalizeTodos(params.todos),
        });
        ctx.onPlanWritten?.({
          type: 'plan_created',
          planId: record.planId,
          title: record.title,
        });
        ctx.push?.(
          makeEnvelope(
            'plan_created',
            {
              planId: record.planId,
              title: record.title,
              markdown: record.markdown,
              todos: record.todos,
            },
            ctx.sessionId,
          ),
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Plan created (id=${record.planId}, title=${record.title}). Waiting for user Confirm/Build.`,
            },
          ],
          details: { error: false, planId: record.planId },
        };
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}

/** CreatePlan 别名，方便模型按 Skill 旧名调用 */
export function createProposePlanTool(ctx: PlanToolContext) {
  const inner = createCreatePlanTool(ctx);
  return defineTool({
    name: 'propose_plan',
    label: 'Propose Plan',
    description: 'Alias of CreatePlan.',
    parameters: inner.parameters,
    execute: inner.execute,
  });
}

export function createUpdatePlanTool(ctx: PlanToolContext) {
  return defineTool({
    name: 'UpdatePlan',
    label: 'Update Plan',
    description: 'Update an existing plan markdown / todos before user confirmation.',
    parameters: Type.Object({
      planId: Type.String({ description: 'Existing plan id' }),
      title: Type.Optional(Type.String()),
      plan: Type.Optional(Type.String({ description: 'Updated markdown body' })),
      todos: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String(),
            content: Type.String(),
            status: Type.Optional(
              Type.Union([
                Type.Literal('pending'),
                Type.Literal('in_progress'),
                Type.Literal('completed'),
                Type.Literal('cancelled'),
              ]),
            ),
          }),
        ),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if (ctx.gate) {
          const decision = await ctx.gate(
            'UpdatePlan',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const record = ctx.planStore.update(ctx.sessionId, params.planId, {
          title: params.title,
          markdown: params.plan,
          todos: params.todos ? normalizeTodos(params.todos) : undefined,
        });
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
            },
            ctx.sessionId,
          ),
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Plan updated (id=${record.planId}).`,
            },
          ],
          details: { error: false, planId: record.planId },
        };
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
