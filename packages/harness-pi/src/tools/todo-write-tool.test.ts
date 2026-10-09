import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlanStore, PolicyEngine, createSessionPolicyGate } from '@ciro/harness-core';
import { createTodoWriteTool } from './todo-write-tool.js';

describe('TodoWrite', () => {
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'todo-write-'));
  const planStore = new PlanStore({ sessionsRoot });
  const policy = new PolicyEngine();
  const agentGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'agent', workspace: '/tmp', preset: 'workspace-write' }),
  });
  const planGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'plan', workspace: '/tmp', preset: 'plan-readonly' }),
  });

  it('replaces the full list and writes back a confirmed plan', async () => {
    const events: string[] = [];
    const created = planStore.create('s1', {
      title: 'Demo',
      markdown: 'Do it',
      todos: [{ id: 't1', content: 'step', status: 'pending' }],
    });
    planStore.markConfirmed('s1', created.planId);
    const tool = createTodoWriteTool({
      sessionId: 's1',
      planStore,
      gate: agentGate,
      getConfirmedPlanId: () => created.planId,
      push: (e) => events.push(e.type),
    });
    const result = await tool.execute('tw1', {
      todos: [
        { id: 't1', content: 'step', status: 'in_progress' },
        { id: 't2', content: 'next', status: 'pending' },
      ],
    });
    expect(result.details.error).toBe(false);
    expect(events).toContain('plan_updated');
    const rec = planStore.read('s1', created.planId);
    expect(rec?.todos).toEqual([
      { id: 't1', content: 'step', status: 'in_progress' },
      { id: 't2', content: 'next', status: 'pending' },
    ]);
    expect(rec?.markdown).toBe('Do it');
  });

  it('skips plan write without confirmedPlanId', async () => {
    const events: string[] = [];
    const tool = createTodoWriteTool({
      sessionId: 's1',
      planStore,
      gate: agentGate,
      getConfirmedPlanId: () => undefined,
      push: (e) => events.push(e.type),
    });
    const result = await tool.execute('tw2', {
      todos: [{ id: 'a', content: 'only', status: 'completed' }],
    });
    expect(result.details.error).toBe(false);
    expect(events).not.toContain('plan_updated');
  });

  it('denies in plan mode', async () => {
    const tool = createTodoWriteTool({
      sessionId: 's1',
      planStore,
      gate: planGate,
      getConfirmedPlanId: () => undefined,
    });
    const blocked = await tool.execute('tw3', {
      todos: [{ id: 'a', content: 'x', status: 'pending' }],
    });
    expect(blocked.details.error).toBe(true);
  });
});
