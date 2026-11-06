/**
 * Task(browser) ↔ L3 Playwright MCP 约定（§9.6）。
 * 能力闸门：server 在会话启用集且已连接、且至少有一个白名单工具可见。
 */

/** 用户 `.mcp.json` 中的参考 server id */
export const BROWSER_MCP_SERVER_ID = 'playwright';

/**
 * Playwright MCP 工具短名白名单（不含 mcp:{server}: 前缀）。
 * 对照 @playwright/mcp 常见工具；未在表内不注入子循环。
 */
export const BROWSER_MCP_TOOL_ALLOWLIST = [
  'browser_navigate',
  'browser_navigate_back',
  'browser_click',
  'browser_type',
  'browser_press_key',
  'browser_hover',
  'browser_select_option',
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_wait_for',
  'browser_fill_form',
  'browser_evaluate',
  'browser_console_messages',
  'browser_network_requests',
  'browser_tabs',
  'browser_close',
  'browser_resize',
  'browser_handle_dialog',
  'browser_file_upload',
] as const;

const ALLOW = new Set<string>(BROWSER_MCP_TOOL_ALLOWLIST);

export function isBrowserMcpToolName(shortName: string): boolean {
  return ALLOW.has(shortName);
}

/** 从 mcp:{server}:{tool} 取短名 */
export function shortMcpToolName(fullName: string): string | null {
  if (!fullName.startsWith('mcp:')) return null;
  const rest = fullName.slice('mcp:'.length);
  const i = rest.indexOf(':');
  if (i <= 0) return null;
  return rest.slice(i + 1);
}

export function isBrowserMcpServerId(serverId: string): boolean {
  return serverId.toLowerCase() === BROWSER_MCP_SERVER_ID;
}

export type BrowserMcpToolRef = {
  serverId: string;
  name: string;
  fullName?: string;
};

/**
 * 就绪：启用集含 playwright（或同名），且已连接工具里至少有一个白名单项。
 */
export function isBrowserMcpReady(opts: {
  enabledServerIds: readonly string[];
  connectedTools: readonly BrowserMcpToolRef[];
}): boolean {
  const enabled = opts.enabledServerIds.some(isBrowserMcpServerId);
  if (!enabled) return false;
  return opts.connectedTools.some(
    (t) => isBrowserMcpServerId(t.serverId) && isBrowserMcpToolName(t.name),
  );
}

export function filterBrowserMcpTools<T extends BrowserMcpToolRef>(tools: readonly T[]): T[] {
  return tools.filter(
    (t) => isBrowserMcpServerId(t.serverId) && isBrowserMcpToolName(t.name),
  );
}

export const BROWSER_MCP_NOT_READY_MESSAGE =
  'Browser subagent requires Playwright MCP (server id "playwright") enabled and connected for this session. Add it in Settings → MCP, enable it for the turn, then retry.';
