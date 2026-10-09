/** MCP 服务器配置（对齐常见 `.mcp.json` / mcpServers 形态） */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** HTTP(S) MCP endpoint；出站走 SSRF */
  url?: string;
  headers?: Record<string, string>;
  /** true = 已安装但默认不参与连接候选 */
  disabled?: boolean;
}

export interface McpFileConfig {
  mcpServers: Record<string, McpServerConfig>;
  /** 新会话默认本轮启用的 server id */
  ciroDefaultEnabled?: string[];
}

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** MCP annotations.readOnlyHint */
  readOnlyHint?: boolean;
}

export interface McpServerListItem {
  id: string;
  config: McpServerConfig;
  status: McpConnectionStatus;
  error?: string;
  tools: McpToolInfo[];
  source: 'project' | 'global';
  /** 是否在默认启用集 */
  defaultEnabled: boolean;
}

export interface McpToolsChangedPayload {
  sessionId: string;
  enabled: string[];
  toolNames: string[];
  tokenEstimate: number;
  /** 本轮启用集中未成功连接的 serverId → 错误信息 */
  errors?: Record<string, string>;
}
