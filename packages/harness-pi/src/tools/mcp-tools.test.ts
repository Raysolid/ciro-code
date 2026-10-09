import { describe, expect, it } from 'vitest';
import { mcpConnectionErrors, registerMissingMcpTools } from './mcp-tools.js';
import type { McpManager } from '@ciro/harness-core';
import type { buildMcpTools } from './mcp-tools.js';

describe('registerMissingMcpTools', () => {
  it('registers only tools absent from knownNames', () => {
    const registered: string[] = [];
    const tools = [
      { name: 'mcp:a:one' },
      { name: 'mcp:a:two' },
      { name: 'mcp:b:x' },
    ] as ReturnType<typeof buildMcpTools>;

    const added = registerMissingMcpTools(
      tools,
      new Set(['mcp:a:one']),
      (t) => {
        registered.push(t.name);
      },
    );

    expect(added).toEqual(['mcp:a:two', 'mcp:b:x']);
    expect(registered).toEqual(['mcp:a:two', 'mcp:b:x']);
  });

  it('no-ops when registerTool is null', () => {
    const tools = [{ name: 'mcp:a:one' }] as ReturnType<typeof buildMcpTools>;
    expect(registerMissingMcpTools(tools, new Set(), null)).toEqual([]);
  });
});

describe('mcpConnectionErrors', () => {
  it('reports enabled servers that are not connected', () => {
    const manager = {
      listServers: () => [
        { id: 'ok', status: 'connected', error: undefined },
        { id: 'bad', status: 'error', error: 'spawn failed' },
        { id: 'idle', status: 'disconnected', error: undefined },
      ],
    } as unknown as McpManager;

    expect(mcpConnectionErrors(manager, ['ok', 'bad', 'idle', 'missing'])).toEqual({
      bad: 'spawn failed',
      idle: 'MCP server status: disconnected',
      missing: 'MCP server not found',
    });
  });
});
