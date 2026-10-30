/**
 * 四模式 Policy 测试矩阵（对齐 Cursor四模式设计方案.md §12）
 * 由 turbo `pnpm test` / CI 跑 harness-core 时自动纳入。
 */
import { describe, expect, it } from 'vitest';
import { PolicyEngine } from './policy-engine.js';

const engine = new PolicyEngine();
const ws = '/tmp/ws';

describe('§12 Policy matrix — Ask', () => {
  it('write/edit → deny', () => {
    expect(engine.evaluate({ mode: 'ask', toolName: 'write', workspace: ws }).decision).toBe(
      'deny',
    );
    expect(engine.evaluate({ mode: 'ask', toolName: 'edit', workspace: ws }).decision).toBe(
      'deny',
    );
  });

  it('read/grep → allow', () => {
    expect(engine.evaluate({ mode: 'ask', toolName: 'read', workspace: ws }).decision).toBe(
      'allow',
    );
    expect(engine.evaluate({ mode: 'ask', toolName: 'grep', workspace: ws }).decision).toBe(
      'allow',
    );
  });

  it('git push → deny；git log / echo → allow；未知命令 → ask', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'git push origin main' },
        workspace: ws,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'git log -1 --oneline' },
        workspace: ws,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'echo hello' },
        workspace: ws,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'pnpm test' },
        workspace: ws,
      }).decision,
    ).toBe('ask');
  });
});

describe('§12 Policy matrix — Plan', () => {
  it('Confirm 前 write → deny', () => {
    expect(engine.evaluate({ mode: 'plan', toolName: 'write', workspace: ws }).decision).toBe(
      'deny',
    );
  });

  it('AskQuestion / CreatePlan → allow', () => {
    expect(
      engine.evaluate({ mode: 'plan', toolName: 'AskQuestion', workspace: ws }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({ mode: 'plan', toolName: 'CreatePlan', workspace: ws }).decision,
    ).toBe('allow');
  });

  it('Confirm 后等价 agent：write → allow', () => {
    // Confirm 升格后 mode=agent（见 runtime.confirmPlan）
    expect(engine.evaluate({ mode: 'agent', toolName: 'write', workspace: ws }).decision).toBe(
      'allow',
    );
  });

  it('TodoWrite：plan/ask deny；agent/debug allow', () => {
    expect(engine.evaluate({ mode: 'plan', toolName: 'TodoWrite', workspace: ws }).decision).toBe(
      'deny',
    );
    expect(engine.evaluate({ mode: 'ask', toolName: 'TodoWrite', workspace: ws }).decision).toBe(
      'deny',
    );
    expect(engine.evaluate({ mode: 'agent', toolName: 'TodoWrite', workspace: ws }).decision).toBe(
      'allow',
    );
    expect(engine.evaluate({ mode: 'debug', toolName: 'TodoWrite', workspace: ws }).decision).toBe(
      'allow',
    );
  });

  it('再切回 ask 仍 deny 写', () => {
    expect(engine.evaluate({ mode: 'ask', toolName: 'write', workspace: ws }).decision).toBe(
      'deny',
    );
  });
});

describe('§12 Policy matrix — Debug', () => {
  const logRel = '.ciro/debug/debug-sess1.log';
  const otherRel = '.ciro/debug/debug-other.log';

  it('delete_file(本 session log) → allow；他 session log → deny', () => {
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'delete_file',
        toolInput: { path: logRel },
        workspace: ws,
        debugLogPathRel: logRel,
        debugLogPath: `${ws}/${logRel}`,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'delete_file',
        toolInput: { path: otherRel },
        workspace: ws,
        debugLogPathRel: logRel,
        debugLogPath: `${ws}/${logRel}`,
      }).decision,
    ).toBe('deny');
  });

  it('bash rm debug log → deny', () => {
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'bash',
        toolInput: { command: `rm ${logRel}` },
        workspace: ws,
        debugLogPathRel: logRel,
      }).decision,
    ).toBe('deny');
  });

  it('bash rm invented ndjson log → deny', () => {
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'bash',
        toolInput: { command: 'rm debug-checkout.ndjson' },
        workspace: ws,
        debugLogPathRel: logRel,
      }).decision,
    ).toBe('deny');
  });

  it('埋点回合：读 log → deny；自跑测试/受测程序 → allow；Proceed 后可读 log', () => {
    const locked = {
      mode: 'debug' as const,
      workspace: ws,
      debugLogPathRel: logRel,
      debugLogPath: `${ws}/${logRel}`,
    };
    expect(
      engine.evaluate({ ...locked, toolName: 'read', toolInput: { path: logRel } }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        ...locked,
        toolName: 'bash',
        toolInput: { command: 'node debug-checkout.js' },
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({ ...locked, toolName: 'read', toolInput: { path: 'debug-checkout.js' } })
        .decision,
    ).toBe('allow');
    const unlocked = { ...locked, debugAnalyzeUnlocked: true };
    expect(
      engine.evaluate({ ...unlocked, toolName: 'read', toolInput: { path: logRel } }).decision,
    ).toBe('allow');
  });

  it('Proceed 后仍 deny 剥探针；Mark as fixed 后 allow', () => {
    const probe = '// #region agent log\nfetch("http://127.0.0.1:1/ingest/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");\n';
    const edit = {
      mode: 'debug' as const,
      workspace: ws,
      toolName: 'edit',
      toolInput: { path: 'app.js', old_string: probe, new_string: '' },
    };
    expect(engine.evaluate({ ...edit, debugAnalyzeUnlocked: true }).decision).toBe('deny');
    expect(
      engine.evaluate({ ...edit, debugAnalyzeUnlocked: true, debugCleanupUnlocked: true }).decision,
    ).toBe('allow');
  });
});

describe('§12 Policy matrix — Switch / Build', () => {
  it('agent 工具集含 write；plan 工具集不含 write（whitelist）', () => {
    expect(engine.evaluate({ mode: 'agent', toolName: 'write', workspace: ws }).decision).toBe(
      'allow',
    );
    expect(engine.evaluate({ mode: 'plan', toolName: 'write', workspace: ws }).decision).toBe(
      'deny',
    );
  });
});
