import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlanStore, PlanQuestionBroker, PolicyEngine, createSessionPolicyGate } from '@ciro-code/harness-core';
import {
  createAskQuestionTool,
  createCreatePlanTool,
  createUpdatePlanTool,
} from './plan-tools.js';

describe('plan tools', () => {
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'plan-tools-'));
  const planStore = new PlanStore({ sessionsRoot });
  const policy = new PolicyEngine();
  const planGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'plan', workspace: '/tmp', preset: 'plan-readonly' }),
  });
  const askGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'ask', workspace: '/tmp' }),
  });

  it('AskQuestion blocks until skip and is allowed in plan', async () => {
    const events: string[] = [];
    const questionsBroker = new PlanQuestionBroker();
    let questionId = '';
    questionsBroker.setRequestHandler((req) => {
      questionId = req.id;
      events.push('plan_question');
    });
    const tool = createAskQuestionTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      questionsBroker,
      push: (e) => events.push(e.type),
    });
    const pending = tool.execute('q1', {
      questions: [{ id: 'a', prompt: 'Which approach?', options: [{ id: '1', label: 'A' }] }],
    });
    await vi.waitFor(() => expect(questionId).toBeTruthy());
    expect(questionsBroker.resolve(questionId, { skipped: true })).toBe(true);
    const result = await pending;
    expect(result.details.error).toBe(false);
    expect(String((result.content[0] as { text: string }).text)).toContain('[[plan_q:skip]]');
    expect(events).toContain('plan_question');
  });

  it('AskQuestion result embeds user answers', async () => {
    const questionsBroker = new PlanQuestionBroker();
    let questionId = '';
    questionsBroker.setRequestHandler((req) => {
      questionId = req.id;
    });
    const tool = createAskQuestionTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      questionsBroker,
    });
    const pending = tool.execute('q1', {
      questions: [{ id: 'color', prompt: 'Favorite color?', options: [{ id: 'r', label: 'Red' }] }],
    });
    await vi.waitFor(() => expect(questionId).toBeTruthy());
    expect(
      questionsBroker.resolve(questionId, {
        answers: [{ questionId: 'color', optionIds: ['r'], label: 'Red' }],
      }),
    ).toBe(true);
    const result = await pending;
    const text = String((result.content[0] as { text: string }).text);
    expect(text).toContain('[[plan_q]]');
    expect(text).toContain('"questionId":"color"');
    expect(text).toContain('Red');
  });

  it('AskQuestion schema allows up to five questions', () => {
    const tool = createAskQuestionTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      questionsBroker: new PlanQuestionBroker(),
    });
    expect(tool.description).toContain('1–5');
    const schema = tool.parameters as { properties?: { questions?: { maxItems?: number } } };
    expect(schema.properties?.questions?.maxItems).toBe(5);
  });

  it('CreatePlan writes file and denies in ask mode', async () => {
    const events: string[] = [];
    const create = createCreatePlanTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      push: (e) => events.push(e.type),
    });
    const ok = await create.execute('c1', {
      title: 'Demo',
      plan: '## Do thing\n',
      todos: [{ id: 't1', content: 'step', status: 'pending' }],
    });
    expect(ok.details.error).toBe(false);
    expect(events).toContain('plan_created');
    const planId = (ok.details as { planId?: string }).planId!;
    expect(planStore.read('s1', planId)?.title).toBe('Demo');

    const denied = createAskQuestionTool({
      sessionId: 's1',
      planStore,
      gate: askGate,
      questionsBroker: new PlanQuestionBroker(),
    });
    // AskQuestion not in ask whitelist
    const blocked = await denied.execute('q2', {
      questions: [{ id: 'x', prompt: 'Nope' }],
    });
    expect(blocked.details.error).toBe(true);

    const update = createUpdatePlanTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      push: (e) => events.push(e.type),
    });
    const upd = await update.execute('u1', { planId, plan: '## Updated\n' });
    expect(upd.details.error).toBe(false);
    expect(events).toContain('plan_updated');
  });
});
