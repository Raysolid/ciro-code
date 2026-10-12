import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PolicyEngine, createSessionPolicyGate } from '@ciro-code/harness-core';
import { createSandboxedListFilesTool } from './list-files-tool.js';
import { createSandboxedGrepTool } from './grep-tool.js';
import { createSandboxedReadTool } from './read-tool.js';
import { createSandboxedWriteTool, createSandboxedEditTool } from './write-edit-tool.js';
import { createSandboxedBashTool } from './bash-tool.js';

describe('readonly custom tools', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-tools-'));
  mkdirSync(join(workspace, 'pkg'));
  writeFileSync(join(workspace, 'pkg', 'a.ts'), 'const TODO = 1;\n');
  writeFileSync(join(workspace, 'README.md'), '# tools\n');

  const policy = new PolicyEngine();
  const gate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'ask', workspace }),
  });

  it('list_files returns entries', async () => {
    const tool = createSandboxedListFilesTool(workspace, gate);
    const result = await tool.execute('t1', { path: '.', maxDepth: 2 });
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toContain('README.md');
    expect(result.details.error).toBe(false);
  });

  it('grep finds pattern', async () => {
    const tool = createSandboxedGrepTool(workspace, gate);
    const result = await tool.execute('t2', { pattern: 'TODO', path: '.' });
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toMatch(/TODO/);
    expect(result.details.error).toBe(false);
  });

  it('read is blocked by policy gate deny', async () => {
    const tool = createSandboxedReadTool(workspace, async () => ({
      decision: 'deny',
      reason: 'blocked',
    }));
    const result = await tool.execute('t3', { path: 'README.md' });
    expect(result.details.error).toBe(true);
  });
});

describe('write tools', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-write-'));
  const policy = new PolicyEngine();
  const agentGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'agent', workspace }),
  });
  const askGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'ask', workspace }),
  });

  it('write creates file in agent mode', async () => {
    const tool = createSandboxedWriteTool(workspace, agentGate);
    const result = await tool.execute('w1', { path: 'out.txt', content: 'abc' });
    expect(result.details.error).toBe(false);
    expect(readFileSync(join(workspace, 'out.txt'), 'utf-8')).toBe('abc');
  });

  it('write denied in ask mode', async () => {
    const tool = createSandboxedWriteTool(workspace, askGate);
    const result = await tool.execute('w2', { path: 'nope.txt', content: 'x' });
    expect(result.details.error).toBe(true);
  });

  it('edit replaces first occurrence', async () => {
    writeFileSync(join(workspace, 'edit-me.txt'), 'hello world hello');
    const tool = createSandboxedEditTool(workspace, agentGate);
    const result = await tool.execute('e1', {
      path: 'edit-me.txt',
      old_string: 'hello',
      new_string: 'hi',
    });
    expect(result.details.error).toBe(false);
    expect(readFileSync(join(workspace, 'edit-me.txt'), 'utf-8')).toBe('hi world hello');
  });

  it('bash runs echo in agent mode', async () => {
    const tool = createSandboxedBashTool(workspace, agentGate);
    const result = await tool.execute('b1', { command: 'echo ok' });
    expect(result.details.error).toBe(false);
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text.toLowerCase()).toContain('ok');
  });
});
