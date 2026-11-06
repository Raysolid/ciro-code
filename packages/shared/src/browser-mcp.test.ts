import { describe, expect, it } from 'vitest';
import {
  BROWSER_MCP_SERVER_ID,
  filterBrowserMcpTools,
  isBrowserMcpReady,
  isBrowserMcpToolName,
  shortMcpToolName,
} from './browser-mcp.js';

describe('browser-mcp', () => {
  it('allowlists playwright tool names', () => {
    expect(isBrowserMcpToolName('browser_navigate')).toBe(true);
    expect(isBrowserMcpToolName('browser_snapshot')).toBe(true);
    expect(isBrowserMcpToolName('write_file')).toBe(false);
    expect(isBrowserMcpToolName('browser_unknown')).toBe(false);
    expect(isBrowserMcpToolName('browser_not_in_allowlist')).toBe(false);
  });

  it('parses short name from full mcp tool', () => {
    expect(shortMcpToolName('mcp:playwright:browser_click')).toBe('browser_click');
    expect(shortMcpToolName('bash')).toBeNull();
  });

  it('ready only when enabled and connected allowlisted tools exist', () => {
    expect(
      isBrowserMcpReady({
        enabledServerIds: [BROWSER_MCP_SERVER_ID],
        connectedTools: [],
      }),
    ).toBe(false);
    expect(
      isBrowserMcpReady({
        enabledServerIds: [],
        connectedTools: [
          { serverId: 'playwright', name: 'browser_navigate' },
        ],
      }),
    ).toBe(false);
    expect(
      isBrowserMcpReady({
        enabledServerIds: ['playwright'],
        connectedTools: [
          { serverId: 'playwright', name: 'browser_navigate' },
        ],
      }),
    ).toBe(true);
    expect(
      isBrowserMcpReady({
        enabledServerIds: ['playwright'],
        connectedTools: [{ serverId: 'playwright', name: 'other' }],
      }),
    ).toBe(false);
  });

  it('filters tools', () => {
    const tools = filterBrowserMcpTools([
      { serverId: 'playwright', name: 'browser_snapshot', fullName: 'mcp:playwright:browser_snapshot' },
      { serverId: 'playwright', name: 'secret_tool', fullName: 'mcp:playwright:secret_tool' },
      { serverId: 'playwright', name: 'browser_unknown', fullName: 'mcp:playwright:browser_unknown' },
      { serverId: 'fs', name: 'read_file', fullName: 'mcp:fs:read_file' },
    ]);
    expect(tools.map((t) => t.name)).toEqual(['browser_snapshot']);
  });
});

