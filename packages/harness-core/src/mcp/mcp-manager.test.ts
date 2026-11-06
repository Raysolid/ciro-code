import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isMcpToolName,
  isMcpWriteClassTool,
  McpManager,
  parseMcpToolName,
} from './mcp-manager.js';

describe('mcp tool naming', () => {
  it('parses mcp:slug:tool', () => {
    expect(isMcpToolName('mcp:fs:read_file')).toBe(true);
    expect(parseMcpToolName('mcp:fs:read_file')).toEqual({
      serverId: 'fs',
      toolName: 'read_file',
    });
    expect(isMcpToolName('read')).toBe(false);
  });

  it('detects write-class tools', () => {
    expect(isMcpWriteClassTool('mcp:fs:write_file')).toBe(true);
    expect(isMcpWriteClassTool('mcp:fs:read_file')).toBe(false);
    expect(isMcpWriteClassTool('mcp:fs:search', true)).toBe(false);
    expect(isMcpWriteClassTool('mcp:fs:search', false)).toBe(true);
  });
});

describe('McpManager config', () => {
  it('lists and upserts project .mcp.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-mcp-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          demo: { command: 'echo', args: ['hi'], disabled: true },
        },
        ciroDefaultEnabled: ['demo'],
      }),
      'utf-8',
    );
    const mgr = new McpManager({ workspace: dir });
    const list = mgr.listServers();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('demo');
    expect(list[0].defaultEnabled).toBe(true);
    expect(mgr.getSessionEnabled('s1')).toEqual([]); // disabled → 默认启用过滤掉

    mgr.putServer('demo2', { command: 'npx', args: ['-y', 'x'] });
    expect(mgr.listServers().map((s) => s.id).sort()).toEqual(['demo', 'demo2']);

    mgr.setDefaultEnabled(['demo2']);
    expect(mgr.getSessionEnabled('s2')).toEqual(['demo2']);
    mgr.setSessionEnabled('s2', []);
    expect(mgr.getSessionEnabled('s2')).toEqual([]);
  });

  it('locks session enabled after lockSessionEnabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-mcp-lock-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          a: { command: 'echo', args: ['a'] },
          b: { command: 'echo', args: ['b'] },
        },
        ciroDefaultEnabled: ['a'],
      }),
      'utf-8',
    );
    const mgr = new McpManager({ workspace: dir });
    expect(mgr.isSessionEnabledLocked('s')).toBe(false);
    expect(mgr.getSessionEnabled('s')).toEqual(['a']);
    mgr.setSessionEnabled('s', ['a', 'b']);
    expect(mgr.lockSessionEnabled('s')).toEqual(['a', 'b']);
    expect(mgr.isSessionEnabledLocked('s')).toBe(true);
    expect(mgr.lockSessionEnabled('s')).toEqual(['a', 'b']);
    expect(mgr.setSessionEnabled('s', [])).toEqual(['a', 'b']);
    expect(mgr.getSessionEnabled('s')).toEqual(['a', 'b']);
    mgr.setDefaultEnabled(['b']);
    expect(mgr.getSessionEnabled('s')).toEqual(['a', 'b']);
  });

  it('hydrateSessionEnabled restores after fresh manager', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-mcp-hydrate-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'echo', args: ['hi'] },
        },
      }),
      'utf-8',
    );
    const mgr = new McpManager({ workspace: dir });
    expect(mgr.hasExplicitSessionEnabled('s')).toBe(false);
    mgr.hydrateSessionEnabled('s', ['filesystem'], true);
    expect(mgr.getSessionEnabled('s')).toEqual(['filesystem']);
    expect(mgr.isSessionEnabledLocked('s')).toBe(true);
    expect(mgr.setSessionEnabled('s', [])).toEqual(['filesystem']);
  });

  it('rebindWorkspace same path keeps sessionEnabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-mcp-rebind-'));
    writeFileSync(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'echo', args: ['hi'] },
        },
      }),
      'utf-8',
    );
    const mgr = new McpManager({ workspace: dir });
    mgr.setSessionEnabled('sess', ['filesystem']);
    expect(mgr.getSessionEnabled('sess')).toEqual(['filesystem']);
    mgr.rebindWorkspace(dir);
    expect(mgr.getSessionEnabled('sess')).toEqual(['filesystem']);
    mgr.rebindWorkspace(dir + '/');
    expect(mgr.getSessionEnabled('sess')).toEqual(['filesystem']);
  });
});
