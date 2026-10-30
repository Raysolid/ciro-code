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
import { createGetToolResultTool, createSearchTranscriptTool } from './transcript-tools.js';
import { ToolResultStore } from '@ciro-code/harness-core';

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

  it('search_transcript and get_tool_result read session dir', async () => {
    const sessionDir = mkdtempSync(join(tmpdir(), 'tx-tools-'));
    writeFileSync(
      join(sessionDir, 'events.jsonl'),
      JSON.stringify({
        type: 'message',
        ts: 1,
        role: 'user',
        messageId: 'um1',
        content: 'COMPACTED_DETAIL_xyz',
      }) + '\n',
      'utf-8',
    );
    new ToolResultStore(sessionDir).write('tc99', 'bash', 'EXTERNALIZED_FULL_OUTPUT', 'pointer');

    const search = createSearchTranscriptTool(sessionDir, gate);
    const found = await search.execute('st1', { query: 'COMPACTED_DETAIL' });
    const foundText =
      found.content[0] && 'text' in found.content[0] ? found.content[0].text : '';
    expect(foundText).toContain('COMPACTED_DETAIL_xyz');
    expect(found.details.error).toBe(false);

    const get = createGetToolResultTool(sessionDir, gate);
    const body = await get.execute('st2', { toolCallId: 'tc99' });
    const bodyText = body.content[0] && 'text' in body.content[0] ? body.content[0].text : '';
    expect(bodyText).toContain('EXTERNALIZED_FULL_OUTPUT');
    expect(body.details.error).toBe(false);
  });

  it('read is blocked by policy gate deny', async () => {
    const tool = createSandboxedReadTool(workspace, async () => ({
      decision: 'deny',
      reason: 'blocked',
    }));
    const result = await tool.execute('t3', { path: 'README.md' });
    expect(result.details.error).toBe(true);
  });

  it('read image returns ImageContent when vision enabled', async () => {
    // 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(workspace, 'dot.png'), png);
    const tool = createSandboxedReadTool(workspace, gate, {
      getSupportsVision: () => true,
    });
    const result = await tool.execute('img1', { path: 'dot.png' });
    expect(result.details.error).toBe(false);
    const image = result.content.find((c) => c.type === 'image');
    expect(image && 'mimeType' in image ? image.mimeType : '').toMatch(/^image\//);
    expect(image && 'data' in image ? image.data.length : 0).toBeGreaterThan(0);
  });

  it('read image omits pixels when vision disabled', async () => {
    const tool = createSandboxedReadTool(workspace, gate, {
      getSupportsVision: () => false,
    });
    const result = await tool.execute('img2', { path: 'dot.png' });
    expect(result.details.error).toBe(false);
    expect(result.content.some((c) => c.type === 'image')).toBe(false);
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toMatch(/does not support images/i);
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
