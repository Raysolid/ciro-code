import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PolicyEngine } from './policy-engine.js';

describe('PolicyEngine', () => {
  const engine = new PolicyEngine();

  it('allows read in ask mode', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'read',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('allow');
  });

  it('allows list_files and grep in ask mode', () => {
    expect(
      engine.evaluate({ mode: 'ask', toolName: 'list_files', workspace: '/tmp' }).decision,
    ).toBe('allow');
    expect(engine.evaluate({ mode: 'ask', toolName: 'grep', workspace: '/tmp' }).decision).toBe(
      'allow',
    );
  });

  it('denies memory_* tools (removed) in ask mode', () => {
    for (const toolName of ['memory_save', 'memory_search', 'memory_list']) {
      expect(
        engine.evaluate({ mode: 'ask', toolName, workspace: '/tmp' }).decision,
      ).toBe('deny');
    }
  });

  it('denies write in ask mode', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'write',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('ask mode');
  });

  it('denies write/edit/bash-mutate in plan mode before confirm', () => {
    expect(
      engine.evaluate({ mode: 'plan', toolName: 'write', workspace: '/tmp' }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({ mode: 'plan', toolName: 'edit', workspace: '/tmp' }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'plan',
        toolName: 'bash',
        toolInput: { command: 'npm install' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
  });

  it('allows readonly bash in ask mode', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'git status' },
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'git log -5 | head' },
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
  });

  it('denies non-readonly bash in ask mode', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'bash',
      toolInput: { command: 'npm install' },
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/readonly bash/i);
  });

  it('allows AskQuestion in plan mode whitelist', () => {
    expect(
      engine.evaluate({ mode: 'plan', toolName: 'AskQuestion', workspace: '/tmp' }).decision,
    ).toBe('allow');
  });

  it('denies bash in ask mode when empty', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'bash',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
  });

  it('denies edit in ask mode', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'edit',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
  });

  it('allows write in agent mode (whitelist)', () => {
    const result = engine.evaluate({
      mode: 'agent',
      toolName: 'write',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('allow');
  });

  it('denies unknown tools outside whitelist', () => {
    const result = engine.evaluate({
      mode: 'ask',
      toolName: 'rm_rf',
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('whitelist');
  });

  it('denies force push', () => {
    const result = engine.evaluate({
      mode: 'agent',
      toolName: 'bash',
      toolInput: { command: 'git push --force origin main' },
      workspace: '/tmp',
    });
    expect(result.decision).toBe('deny');
    expect(result.reason).toMatch(/force/i);
  });

  it('asks for git push in agent mode', () => {
    const result = engine.evaluate({
      mode: 'agent',
      toolName: 'bash',
      toolInput: { command: 'git push origin main' },
      workspace: '/tmp',
    });
    expect(result.decision).toBe('ask');
  });

  it('denies curl wget in agent mode', () => {
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'bash',
        toolInput: { command: 'curl https://example.com' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'bash',
        toolInput: { command: 'wget https://example.com -O -' },
        workspace: '/tmp',
      }).reason,
    ).toMatch(/WebFetch/i);
  });

  it('allows WebFetch in ask and agent', () => {
    expect(
      engine.evaluate({ mode: 'ask', toolName: 'WebFetch', workspace: '/tmp' }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({ mode: 'agent', toolName: 'WebFetch', workspace: '/tmp' }).decision,
    ).toBe('allow');
  });

  it('ask allows Task(explore) and denies verify/shell/browser', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'Task',
        toolInput: { subagent_type: 'explore', prompt: 'map auth' },
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'Task',
        toolInput: { subagent_type: 'verify', prompt: 'run tests' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'Task',
        toolInput: { subagent_type: 'shell', prompt: 'ls' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'Task',
        toolInput: { subagent_type: 'browser', prompt: 'open docs' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
  });

  it('plan/agent allow Task(verify); plan denies browser; agent allows browser', () => {
    for (const mode of ['plan', 'agent'] as const) {
      expect(
        engine.evaluate({
          mode,
          toolName: 'Task',
          toolInput: { subagent_type: 'verify', prompt: 'run tests' },
          workspace: '/tmp',
        }).decision,
      ).toBe('allow');
    }
    expect(
      engine.evaluate({
        mode: 'plan',
        toolName: 'Task',
        toolInput: { subagent_type: 'browser', prompt: 'open docs' },
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'Task',
        toolInput: { subagent_type: 'browser', prompt: 'open docs' },
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
  });

  it('denies WebFetch inside subagent', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'WebFetch',
        workspace: '/tmp',
        subagentDepth: 1,
      }).decision,
    ).toBe('deny');
  });

  it('explore subagent (ask+depth): allows readonly bash; denies pnpm test', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'git status' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-readonly',
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'bash',
        toolInput: { command: 'pnpm test' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-readonly',
      }).decision,
    ).toBe('deny');
  });

  it('verify/shell subagent (agent+depth): allows pnpm test; denies write/Task/WebFetch', () => {
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'bash',
        toolInput: { command: 'pnpm test' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-write',
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'write',
        toolInput: { path: 'a.ts', content: 'x' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-write',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'edit',
        toolInput: { path: 'a.ts' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-write',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'Task',
        toolInput: { subagent_type: 'explore', prompt: 'x' },
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-write',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'WebFetch',
        workspace: '/tmp',
        subagentDepth: 1,
        preset: 'workspace-write',
      }).decision,
    ).toBe('deny');
  });

  it('allows safe bash in agent mode', () => {
    const result = engine.evaluate({
      mode: 'agent',
      toolName: 'bash',
      toolInput: { command: 'npm test' },
      workspace: '/tmp',
    });
    expect(result.decision).toBe('allow');
  });

  it('allows delete_file only for debug log path', () => {
    const logRel = '.ciro/debug/debug-abc.log';
    const workspace = '/tmp/ws';
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'delete_file',
        toolInput: { path: logRel },
        workspace,
        debugLogPathRel: logRel,
        debugLogPath: `${workspace}/${logRel}`,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'delete_file',
        toolInput: { path: 'src/a.ts' },
        workspace,
        debugLogPathRel: logRel,
        debugLogPath: `${workspace}/${logRel}`,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'delete_file',
        toolInput: { path: logRel },
        workspace,
      }).decision,
    ).toBe('deny');
  });

  it('denies bash rm of debug log', () => {
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'bash',
        toolInput: { command: 'rm .ciro/debug/debug-abc.log' },
        workspace: '/tmp',
        debugLogPathRel: '.ciro/debug/debug-abc.log',
      }).decision,
    ).toBe('deny');
  });

  it('denies bash rm of invented ndjson log in debug', () => {
    expect(
      engine.evaluate({
        mode: 'debug',
        toolName: 'bash',
        toolInput: { command: 'rm debug-checkout.ndjson' },
        workspace: '/tmp',
        debugLogPathRel: '.ciro/debug/debug-abc.log',
      }).decision,
    ).toBe('deny');
  });

  it('denies reading debug log until unlocked; allows running tests while locked', () => {
    const locked = {
      mode: 'debug' as const,
      workspace: '/tmp/ws',
      debugLogPathRel: '.ciro/debug/debug-abc.log',
      debugLogPath: '/tmp/ws/.ciro/debug/debug-abc.log',
    };
    expect(
      engine.evaluate({
        ...locked,
        toolName: 'read',
        toolInput: { path: '.ciro/debug/debug-abc.log' },
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        ...locked,
        toolName: 'bash',
        toolInput: { command: 'node ./debug-checkout.js' },
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        ...locked,
        toolName: 'bash',
        toolInput: { command: 'npm test' },
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        ...locked,
        debugAnalyzeUnlocked: true,
        toolName: 'read',
        toolInput: { path: '.ciro/debug/debug-abc.log' },
      }).decision,
    ).toBe('allow');
  });

  it('denies stripping debug probes until Mark as fixed', () => {
    const probe = [
      '// #region agent log',
      'await fetch("http://127.0.0.1:9/ingest/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");',
      '// #endregion',
    ].join('\n');
    const base = {
      mode: 'debug' as const,
      workspace: '/tmp/ws',
      debugAnalyzeUnlocked: true,
    };
    expect(
      engine.evaluate({
        ...base,
        toolName: 'edit',
        toolInput: { path: 'app.js', old_string: probe, new_string: 'const payable = 27.5;' },
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        ...base,
        debugCleanupUnlocked: true,
        toolName: 'edit',
        toolInput: { path: 'app.js', old_string: probe, new_string: 'const payable = 27.5;' },
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        ...base,
        toolName: 'edit',
        toolInput: {
          path: 'app.js',
          old_string: 'sum += item.price;',
          new_string: 'sum += Number(item.price) * item.qty;',
        },
      }).decision,
    ).toBe('allow');
    const ws = mkdtempSync(join(tmpdir(), 'debug-probes-'));
    writeFileSync(join(ws, 'app.js'), `${probe}\nfunction main() { return 1; }\n`, 'utf-8');
    expect(
      engine.evaluate({
        ...base,
        workspace: ws,
        toolName: 'write',
        toolInput: { path: 'app.js', content: 'function main() { return 1; }\n' },
      }).decision,
    ).toBe('deny');
  });

  it('denies write-class mcp in ask; allows read-class and agent write', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'mcp:fs:write_file',
        workspace: '/tmp',
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'mcp:fs:read_file',
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'mcp:fs:write_file',
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
  });

  it('honors readOnlyHint over name heuristic for mcp in ask', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'mcp:fs:write_file',
        workspace: '/tmp',
        readOnlyHint: true,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'mcp:fs:search',
        workspace: '/tmp',
        readOnlyHint: false,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'mcp:fs:search',
        workspace: '/tmp',
      }).decision,
    ).toBe('allow');
  });

  it('denies write-class ext tools in ask; allows read-class and agent write', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'ext:hello:writeish',
        workspace: '/tmp',
        readOnlyHint: false,
      }).decision,
    ).toBe('deny');
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'ext:hello:ping',
        workspace: '/tmp',
        readOnlyHint: true,
      }).decision,
    ).toBe('allow');
    expect(
      engine.evaluate({
        mode: 'agent',
        toolName: 'ext:hello:writeish',
        workspace: '/tmp',
        readOnlyHint: false,
      }).decision,
    ).toBe('allow');
  });

  it('denies ext tools inside subagent', () => {
    expect(
      engine.evaluate({
        mode: 'ask',
        toolName: 'ext:hello:ping',
        workspace: '/tmp',
        readOnlyHint: true,
        subagentDepth: 1,
      }).decision,
    ).toBe('deny');
  });
});
