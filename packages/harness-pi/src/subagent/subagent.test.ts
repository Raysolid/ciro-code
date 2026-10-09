import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHarnessConfig,
  isSummarySchemaV1,
  parseSummarySchemaV1,
  EXPLORE_TOOLS,
  getSubagentKind,
  isSubagentType,
  SUBAGENT_KIND_TABLE,
} from '@ciro/harness-shared';
import {
  SubagentOrchestrator,
  SessionStore,
  PolicyEngine,
  readSubagentEvents,
  type ExploreRunner,
} from '@ciro/harness-core';
import { MockAgentRuntime } from '../runtime/mock-agent-runtime.js';
import { createMockExploreRunner } from './mock-explore-runner.js';
import {
  createSubmitExploreSummaryTool,
  normalizeSummaryParams,
  EXPLORE_SYSTEM,
  VERIFY_SYSTEM,
  SHELL_SYSTEM,
  BROWSER_SYSTEM,
  SUBMIT_REMINDER,
} from './llm-explore-runner.js';

const stubSummary = {
  conclusion: 'done',
  paths: ['readme.md'] as string[],
  symbols: [] as string[],
  openQuestions: [] as string[],
  confidence: 'high' as const,
};

const instantRunner: ExploreRunner = async ({ onEvent, onProgress }) => {
  onEvent({ type: 'token', delta: 'hi ' });
  onProgress('Scanning…');
  onEvent({
    type: 'tool_call_start',
    toolCallId: 't1',
    toolName: 'read',
    toolInput: { path: 'readme.md' },
  });
  onEvent({
    type: 'tool_call_result',
    toolCallId: 't1',
    toolName: 'read',
    resultPreview: '# hello',
    isError: false,
  });
  return stubSummary;
};

describe('normalizeSummaryParams', () => {
  it('defaults omitted arrays and coerces confidence case', () => {
    expect(
      normalizeSummaryParams({
        conclusion: ' ok ',
        confidence: 'HIGH',
      }),
    ).toEqual({
      conclusion: 'ok',
      paths: [],
      symbols: [],
      openQuestions: [],
      confidence: 'high',
    });
  });
});

describe('createSubmitExploreSummaryTool', () => {
  it('accepts valid schema and rejects invalid args', async () => {
    const holder: { summary: typeof stubSummary | null } = { summary: null };
    let accepted = 0;
    const tool = createSubmitExploreSummaryTool(holder, { onAccepted: () => {
      accepted += 1;
    } });
    const ok = await tool.execute('tc1', stubSummary);
    expect(holder.summary).toEqual(stubSummary);
    expect(ok.details).toEqual(expect.objectContaining({ error: false }));
    await new Promise((r) => queueMicrotask(r));
    expect(accepted).toBe(1);

    const holder2: { summary: typeof stubSummary | null } = { summary: null };
    const tool2 = createSubmitExploreSummaryTool(holder2);
    const bad = await tool2.execute('tc2', {
      conclusion: '',
      paths: [],
      symbols: [],
      openQuestions: [],
      confidence: 'high',
    });
    expect(holder2.summary).toBeNull();
    expect(bad.details).toEqual(expect.objectContaining({ error: true }));
  });

  it('accepts omitted array fields', async () => {
    const holder: { summary: typeof stubSummary | null } = { summary: null };
    const tool = createSubmitExploreSummaryTool(holder);
    const ok = await tool.execute('tc3', {
      conclusion: 'enough',
      confidence: 'medium',
    } as typeof stubSummary);
    expect(ok.details).toEqual(expect.objectContaining({ error: false }));
    expect(holder.summary).toEqual({
      conclusion: 'enough',
      paths: [],
      symbols: [],
      openQuestions: [],
      confidence: 'medium',
    });
  });

  it('accepts uppercase confidence via execute', async () => {
    const holder: { summary: typeof stubSummary | null } = { summary: null };
    const tool = createSubmitExploreSummaryTool(holder);
    const ok = await tool.execute('tc4', {
      conclusion: 'done',
      confidence: 'HIGH',
    } as typeof stubSummary);
    expect(ok.details).toEqual(expect.objectContaining({ error: false }));
    expect(holder.summary).toEqual({
      conclusion: 'done',
      paths: [],
      symbols: [],
      openQuestions: [],
      confidence: 'high',
    });
  });
});

describe('subagent kind table', () => {
  it('maps explore/verify/shell/browser policy modes and rejects unknown types', () => {
    expect(getSubagentKind('explore').policyMode).toBe('ask');
    expect(getSubagentKind('verify').policyMode).toBe('agent');
    expect(getSubagentKind('shell').policyMode).toBe('agent');
    expect(getSubagentKind('browser').policyMode).toBe('agent');
    expect(getSubagentKind('verify').tools).toEqual(EXPLORE_TOOLS);
    expect(getSubagentKind('shell').tools).toEqual(EXPLORE_TOOLS);
    expect(getSubagentKind('browser').tools).toEqual(['SubmitExploreSummary']);
    expect(isSubagentType('explore')).toBe(true);
    expect(isSubagentType('shell')).toBe(true);
    expect(isSubagentType('browser')).toBe(true);
    expect(isSubagentType('custom')).toBe(false);
    expect(Object.keys(SUBAGENT_KIND_TABLE).sort()).toEqual([
      'browser',
      'explore',
      'shell',
      'verify',
    ]);
  });
});

describe('explore prompt requires SubmitExploreSummary', () => {
  it('documents Submit tool and forbids JSON assistant text / bash echo', () => {
    expect(EXPLORE_SYSTEM).toMatch(/SubmitExploreSummary/);
    expect(EXPLORE_SYSTEM).toMatch(/Do NOT output summary JSON/);
    expect(EXPLORE_SYSTEM).toMatch(/Do NOT use bash\/echo\/printf/);
    expect(SUBMIT_REMINDER).toMatch(/call SubmitExploreSummary/);
    expect(VERIFY_SYSTEM).toMatch(/Verify subagent/);
    expect(VERIFY_SYSTEM).toMatch(/Do not call Task or WebFetch/);
    expect(SHELL_SYSTEM).toMatch(/Shell subagent/);
    expect(SHELL_SYSTEM).toMatch(/Do not call Task or WebFetch/);
    expect(BROWSER_SYSTEM).toMatch(/Browser subagent/);
    expect(BROWSER_SYSTEM).toMatch(/Playwright MCP/);
    expect(BROWSER_SYSTEM).toMatch(/Do not call Task/);
    expect(SUBMIT_REMINDER).toMatch(/Do NOT output JSON as assistant text/);
    expect(EXPLORE_TOOLS).toContain('SubmitExploreSummary');
  });
});

describe('summary_schema_v1', () => {
  it('validates required fields', () => {
    expect(
      isSummarySchemaV1({
        conclusion: 'ok',
        paths: ['a.ts'],
        symbols: ['Foo'],
        openQuestions: [],
        confidence: 'high',
      }),
    ).toBe(true);
    expect(
      isSummarySchemaV1({
        conclusion: '',
        paths: [],
        symbols: [],
        openQuestions: [],
        confidence: 'high',
      }),
    ).toBe(false);
    expect(
      parseSummarySchemaV1(
        '{"conclusion":"x","paths":[],"symbols":[],"openQuestions":[],"confidence":"low"}',
      ),
    ).toEqual(expect.objectContaining({ conclusion: 'x', confidence: 'low' }));
  });
});

describe('SubagentOrchestrator', () => {
  let root: string;
  let sessionDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ciro-subagent-'));
    sessionDir = join(root, 'session');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(root, 'readme.md'), '# hello\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('emits SSE and returns schema; respects maxParallel', async () => {
    const events: string[] = [];
    const orch = new SubagentOrchestrator({
      config: { maxParallel: 1, timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: instantRunner,
    });

    const [r1, r2] = await Promise.all([
      orch.runExplore({
        parentSessionId: 'parent',
        workspace: root,
        prompt: 'Find readme and architecture',
        push: (e) => events.push(e.type),
      }),
      orch.runExplore({
        parentSessionId: 'parent',
        workspace: root,
        prompt: 'second',
        push: (e) => events.push(e.type),
      }),
    ]);
    expect(r1.ok || r2.ok).toBe(true);
    const failed = r1.ok ? r2 : r1;
    const ok = r1.ok ? r1 : r2;
    expect(ok.summary && isSummarySchemaV1(ok.summary)).toBe(true);
    expect(failed.ok).toBe(false);
    expect(failed.reason).toBe('max_parallel');
    expect(failed.toolResultText).toContain('maxParallel');
    expect(events).toContain('subagent_start');
    expect(events).toContain('subagent_progress');
    expect(events).toContain('subagent_completed');

    const disk = readSubagentEvents(sessionDir, ok.taskId);
    expect(disk.some((e) => e.type === 'token')).toBe(true);
    expect(disk.some((e) => e.type === 'tool_call_start')).toBe(true);
  });

  it('partial success: one inject error does not cancel sibling', async () => {
    const orch = new SubagentOrchestrator({
      config: { maxParallel: 3 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: instantRunner,
    });
    const [a, b] = await Promise.all([
      orch.runExplore({
        parentSessionId: 'p',
        workspace: root,
        prompt: 'ok',
        injectSummary: stubSummary,
      }),
      orch.runExplore({
        parentSessionId: 'p',
        workspace: root,
        prompt: 'bad',
        injectError: 'boom',
      }),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    expect(b.status).toBe('failed');
    expect(JSON.parse(b.toolResultText).status).toBe('error');
  });

  it('abort → stopped', async () => {
    const orch = new SubagentOrchestrator({
      config: { timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: async ({ signal, onProgress, onEvent }) => {
        onEvent({ type: 'thinking', delta: 'slow' });
        onProgress('slow');
        await new Promise((r) => setTimeout(r, 200));
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return {
          conclusion: 'late',
          paths: [],
          symbols: [],
          openQuestions: [],
          confidence: 'low',
        };
      },
    });
    const pending = orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'slow',
    });
    await new Promise((r) => setTimeout(r, 20));
    const metas = orch.listMetas(sessionDir);
    expect(metas[0]?.status).toBe('running');
    orch.abortTask(metas[0]!.taskId, 'user');
    const result = await pending;
    expect(result.status).toBe('stopped');
    expect(result.ok).toBe(false);
  });

  it('invalid runner summary → failed', async () => {
    const orch = new SubagentOrchestrator({
      resolveSessionDir: () => sessionDir,
      exploreRunner: async () =>
        ({ conclusion: '', paths: [], symbols: [], openQuestions: [], confidence: 'high' }) as never,
    });
    const r = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'x',
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('failed');
  });

  it('disposeParent removes subagents directory', async () => {
    const orch = new SubagentOrchestrator({
      resolveSessionDir: () => sessionDir,
      exploreRunner: instantRunner,
    });
    await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'x',
      injectSummary: {
        conclusion: 'c',
        paths: [],
        symbols: [],
        openQuestions: [],
        confidence: 'medium',
      },
    });
    expect(existsSync(join(sessionDir, 'subagents'))).toBe(true);
    orch.disposeParent('p', sessionDir);
    expect(existsSync(join(sessionDir, 'subagents'))).toBe(false);
  });

  it('runExplore with verify sets subagentType', async () => {
    const orch = new SubagentOrchestrator({
      config: { maxParallel: 2, timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: instantRunner,
    });
    const r = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'run tests',
      subagentType: 'verify',
    });
    expect(r.ok).toBe(true);
    const meta = orch.getMeta(sessionDir, r.taskId);
    expect(meta?.subagentType).toBe('verify');
  });

  it('background returns running then onSettled with summary', async () => {
    let settled: Awaited<ReturnType<SubagentOrchestrator['runExplore']>> | undefined;
    const startEvents: Array<{ background?: boolean }> = [];
    const orch = new SubagentOrchestrator({
      config: { timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: async ({ signal }) => {
        await new Promise((r) => setTimeout(r, 40));
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return stubSummary;
      },
    });
    const early = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'bg research',
      background: true,
      push: (e) => {
        if (e.type === 'subagent_start') {
          startEvents.push(e.payload as { background?: boolean });
        }
      },
      onSettled: (r) => {
        settled = r;
      },
    });
    expect(early.status).toBe('running');
    expect(early.ok).toBe(true);
    expect(JSON.parse(early.toolResultText).status).toBe('running');
    expect(startEvents[0]?.background).toBe(true);
    expect(orch.getMeta(sessionDir, early.taskId)?.background).toBe(true);
    expect(orch.inflightCount('p')).toBe(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(settled?.ok).toBe(true);
    expect(settled?.summary && isSummarySchemaV1(settled.summary)).toBe(true);
    expect(orch.inflightCount('p')).toBe(0);
  });

  it('background occupies maxParallel slot', async () => {
    const orch = new SubagentOrchestrator({
      config: { maxParallel: 1, timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: async ({ signal }) => {
        await new Promise((r) => setTimeout(r, 80));
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return stubSummary;
      },
    });
    const bg = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'hold',
      background: true,
    });
    expect(bg.status).toBe('running');
    const blocked = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'second',
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('max_parallel');
    orch.abortTask(bg.taskId, 'user');
    await new Promise((r) => setTimeout(r, 20));
  });

  it('abort kills background task', async () => {
    let resolveSettled!: (r: Awaited<ReturnType<SubagentOrchestrator['runExplore']>>) => void;
    const settledP = new Promise<Awaited<ReturnType<SubagentOrchestrator['runExplore']>>>(
      (resolve) => {
        resolveSettled = resolve;
      },
    );
    const orch = new SubagentOrchestrator({
      config: { timeoutMs: 60_000 },
      resolveSessionDir: () => sessionDir,
      exploreRunner: async ({ signal }) => {
        await new Promise((r) => setTimeout(r, 200));
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return stubSummary;
      },
    });
    const early = await orch.runExplore({
      parentSessionId: 'p',
      workspace: root,
      prompt: 'slow bg',
      background: true,
      onSettled: (r) => resolveSettled(r),
    });
    expect(early.status).toBe('running');
    orch.abortAllForParent('p', 'parent_abort');
    const settled = await settledP;
    expect(settled.status).toBe('stopped');
    expect(settled.reason).toBe('parent_abort');
    expect(orch.inflightCount('p')).toBe(0);
  });
});

describe('Policy subagentDepth', () => {
  const engine = new PolicyEngine();

  it('denies write and Task when depth>=1', () => {
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'write',
        workspace: '/tmp',
        subagentDepth: 1,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'Task',
        workspace: '/tmp',
        subagentDepth: 1,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'read',
        workspace: '/tmp',
        subagentDepth: 1,
      }).decision,
    ).toBe('allow');
  });

  it('EXPLORE_TOOLS excludes Task and write', () => {
    expect(EXPLORE_TOOLS).not.toContain('Task');
    expect(EXPLORE_TOOLS).not.toContain('write');
  });
});

describe('MockAgentRuntime Task explore E2E', () => {
  let root: string;
  let store: SessionStore;
  let rt: MockAgentRuntime;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ciro-mock-task-'));
    writeFileSync(join(root, 'app.ts'), 'export const App = 1\n', 'utf-8');
    store = new SessionStore({
      sessionsRoot: join(root, 'sessions'),
      snapshotInterval: 100,
    });
    rt = new MockAgentRuntime(
      createHarnessConfig({ workspace: root, agentBackend: 'mock', mode: 'agent' }),
      { sessionStore: store },
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('streams subagent_* and schema; context subagents bucket > 0', async () => {
    const session = await rt.createSession({ workspace: root, mode: 'agent' });
    const envelopes: { type: string; payload: unknown }[] = [];
    for await (const env of rt.sendMessage(
      session.id,
      { message: 'task explore <<<Find App symbol and paths>>>' },
      { sessionId: session.id, workspace: root, mode: 'agent' },
    )) {
      envelopes.push({ type: env.type, payload: env.payload });
    }
    const types = envelopes.map((e) => e.type);
    expect(types).toContain('subagent_start');
    expect(types).toContain('subagent_completed');
    expect(types).toContain('tool_call_start');
    const completed = envelopes.find((e) => e.type === 'subagent_completed');
    expect(completed?.payload).toEqual(
      expect.objectContaining({ status: 'completed', subagentType: 'explore' }),
    );
    const metas = rt.listSubagents(session.id);
    expect(metas.length).toBe(1);
    expect(metas[0]!.status).toBe('completed');
    expect(isSummarySchemaV1(metas[0]!.summary)).toBe(true);

    const view = rt.getSubagent(session.id, metas[0]!.taskId);
    expect(view?.events.some((e) => e.type === 'token')).toBe(true);
    expect(view?.events.some((e) => e.type === 'tool_call_start')).toBe(true);

    const snap = rt.getContextUsage(session.id);
    expect(snap?.buckets.find((b) => b.id === 'subagents')?.tokens ?? 0).toBeGreaterThan(0);
    expect(store.list().some((s) => s.id === metas[0]!.taskId)).toBe(false);
  });

  it('streams Task(browser) mock with browser tools and summary', async () => {
    const session = await rt.createSession({ workspace: root, mode: 'agent' });
    const envelopes: { type: string; payload: unknown }[] = [];
    for await (const env of rt.sendMessage(
      session.id,
      { message: 'task browser <<<Open example.com and summarize>>>' },
      { sessionId: session.id, workspace: root, mode: 'agent' },
    )) {
      envelopes.push({ type: env.type, payload: env.payload });
    }
    expect(envelopes.map((e) => e.type)).toEqual(
      expect.arrayContaining(['subagent_start', 'subagent_completed', 'tool_call_start']),
    );
    const completed = envelopes.find((e) => e.type === 'subagent_completed');
    expect(completed?.payload).toEqual(
      expect.objectContaining({ status: 'completed', subagentType: 'browser' }),
    );
    const metas = rt.listSubagents(session.id);
    expect(metas[0]?.subagentType).toBe('browser');
    expect(isSummarySchemaV1(metas[0]?.summary)).toBe(true);
    const view = rt.getSubagent(session.id, metas[0]!.taskId);
    expect(
      view?.events.some(
        (e) => e.type === 'tool_call_start' && String(e.toolName).includes('browser_'),
      ),
    ).toBe(true);
  });

  it('createMockExploreRunner returns schema', async () => {
    const runner = createMockExploreRunner();
    const ac = new AbortController();
    const events: string[] = [];
    const summary = await runner({
      taskId: 't',
      parentSessionId: 'p',
      workspace: root,
      prompt: 'brief',
      title: 't',
      signal: ac.signal,
      onProgress: () => events.push('progress'),
      onEvent: (e) => events.push(e.type),
    });
    expect(isSummarySchemaV1(summary)).toBe(true);
    expect(events).toContain('token');
    expect(events).toContain('tool_call_start');
  });
});
