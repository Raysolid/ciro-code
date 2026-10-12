import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  McpConnectionStatus,
  McpFileConfig,
  McpServerConfig,
  McpServerListItem,
  McpToolInfo,
} from '@ciro-code/harness-shared';
import {
  globalMcpConfigPath,
  projectMcpConfigPath,
} from '../paths/product-paths.js';
import {
  createSsrfFetch,
  validateOutboundUrl,
} from '../net/validate-outbound-url.js';

type LiveConnection = {
  client: Client;
  transport: { close?: () => Promise<void> };
  tools: McpToolInfo[];
  status: McpConnectionStatus;
  error?: string;
};

function emptyFile(): McpFileConfig {
  return { mcpServers: {}, ciroDefaultEnabled: [] };
}

function parseFile(raw: string): McpFileConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Invalid MCP JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('Invalid MCP JSON root');
  const root = data as Record<string, unknown>;
  const serversRaw = root.mcpServers;
  const mcpServers: Record<string, McpServerConfig> = {};
  if (serversRaw && typeof serversRaw === 'object') {
    for (const [id, cfg] of Object.entries(serversRaw as Record<string, unknown>)) {
      if (!cfg || typeof cfg !== 'object') continue;
      mcpServers[id] = cfg as McpServerConfig;
    }
  }
  const def = root.ciroDefaultEnabled;
  const ciroDefaultEnabled = Array.isArray(def)
    ? def.filter((x): x is string => typeof x === 'string')
    : [];
  return { mcpServers, ciroDefaultEnabled };
}

function readConfigFile(path: string): McpFileConfig {
  if (!existsSync(path)) return emptyFile();
  return parseFile(readFileSync(path, 'utf-8'));
}

function writeConfigFile(path: string, cfg: McpFileConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8');
}

function toolName(serverId: string, name: string): string {
  return `mcp:${serverId}:${name}`;
}

function extractReadOnlyHint(tool: {
  annotations?: { readOnlyHint?: boolean };
}): boolean | undefined {
  const v = tool.annotations?.readOnlyHint;
  return typeof v === 'boolean' ? v : undefined;
}

function looksLikeWriteTool(name: string, readOnlyHint?: boolean): boolean {
  if (readOnlyHint === true) return false;
  if (readOnlyHint === false) return true;
  return /(?:^|[_-])(write|create|update|delete|remove|put|post|patch|edit|set|append|mkdir|move|rename|unlink)(?:$|[_-])/i.test(
    name,
  );
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith('mcp:') && name.split(':').length >= 3;
}

export function parseMcpToolName(
  name: string,
): { serverId: string; toolName: string } | null {
  if (!isMcpToolName(name)) return null;
  const rest = name.slice('mcp:'.length);
  const i = rest.indexOf(':');
  if (i <= 0) return null;
  return { serverId: rest.slice(0, i), toolName: rest.slice(i + 1) };
}

/** Ask/Plan：写类 MCP deny；有 readOnlyHint=true 才放行；未知且无写名启发式则放行读倾向 */
export function isMcpWriteClassTool(
  toolNameFull: string,
  readOnlyHint?: boolean,
): boolean {
  const parsed = parseMcpToolName(toolNameFull);
  const short = parsed?.toolName ?? toolNameFull;
  return looksLikeWriteTool(short, readOnlyHint);
}

export type McpManagerOptions = {
  workspace: string;
};

/**
 * MCP 安装（配置）与连接；本轮启用集按 session 存放。
 * 命名：`mcp:{serverSlug}:{toolName}`。
 */
export class McpManager {
  private workspace: string;
  private readonly live = new Map<string, LiveConnection>();
  /** sessionId → enabled server ids */
  private readonly sessionEnabled = new Map<string, string[]>();
  private defaultEnabled: string[] = [];

  constructor(opts: McpManagerOptions) {
    this.workspace = opts.workspace;
    this.reloadDefaultsFromDisk();
  }

  rebindWorkspace(workspace: string): void {
    void this.disconnectAll();
    this.workspace = workspace;
    this.sessionEnabled.clear();
    this.reloadDefaultsFromDisk();
  }

  private projectPath(): string {
    return projectMcpConfigPath(this.workspace);
  }

  private globalPath(): string {
    return globalMcpConfigPath();
  }

  private reloadDefaultsFromDisk(): void {
    const project = readConfigFile(this.projectPath());
    const global = readConfigFile(this.globalPath());
    const merged = new Set<string>([
      ...(global.ciroDefaultEnabled ?? []),
      ...(project.ciroDefaultEnabled ?? []),
    ]);
    this.defaultEnabled = [...merged];
  }

  /** project 覆盖 global 同名 id */
  private mergedServers(): Map<string, { config: McpServerConfig; source: 'project' | 'global' }> {
    const out = new Map<string, { config: McpServerConfig; source: 'project' | 'global' }>();
    const global = readConfigFile(this.globalPath());
    for (const [id, config] of Object.entries(global.mcpServers)) {
      out.set(id, { config, source: 'global' });
    }
    const project = readConfigFile(this.projectPath());
    for (const [id, config] of Object.entries(project.mcpServers)) {
      out.set(id, { config, source: 'project' });
    }
    return out;
  }

  listServers(): McpServerListItem[] {
    const merged = this.mergedServers();
    const defaults = new Set(this.defaultEnabled);
    return [...merged.entries()].map(([id, { config, source }]) => {
      const live = this.live.get(id);
      return {
        id,
        config,
        status: live?.status ?? 'disconnected',
        error: live?.error,
        tools: live?.tools ?? [],
        source,
        defaultEnabled: defaults.has(id),
      };
    });
  }

  getDefaultEnabled(): string[] {
    return [...this.defaultEnabled];
  }

  setDefaultEnabled(ids: string[]): string[] {
    const known = new Set(this.mergedServers().keys());
    this.defaultEnabled = [...new Set(ids.filter((id) => known.has(id)))];
    const project = readConfigFile(this.projectPath());
    project.ciroDefaultEnabled = this.defaultEnabled;
    writeConfigFile(this.projectPath(), project);
    return this.getDefaultEnabled();
  }

  /** 整表替换工作区 `.mcp.json` 的 mcpServers（保留/合并 defaults） */
  upsertServers(
    servers: Record<string, McpServerConfig>,
    opts?: { defaultEnabled?: string[] },
  ): McpServerListItem[] {
    const project = readConfigFile(this.projectPath());
    project.mcpServers = { ...servers };
    if (opts?.defaultEnabled) {
      project.ciroDefaultEnabled = opts.defaultEnabled;
      this.defaultEnabled = [...opts.defaultEnabled];
    }
    writeConfigFile(this.projectPath(), project);
    // 断开已删除的
    for (const id of this.live.keys()) {
      if (!(id in servers)) void this.disconnect(id);
    }
    return this.listServers();
  }

  putServer(id: string, config: McpServerConfig): McpServerListItem {
    const slug = id.trim();
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new Error('Invalid server id (use letters, digits, _-)');
    }
    const project = readConfigFile(this.projectPath());
    project.mcpServers[slug] = config;
    writeConfigFile(this.projectPath(), project);
    void this.disconnect(slug);
    return this.listServers().find((s) => s.id === slug)!;
  }

  removeServer(id: string): void {
    const project = readConfigFile(this.projectPath());
    if (!(id in project.mcpServers)) {
      throw new Error(`Server not found in project config: ${id}`);
    }
    delete project.mcpServers[id];
    project.ciroDefaultEnabled = (project.ciroDefaultEnabled ?? []).filter((x) => x !== id);
    writeConfigFile(this.projectPath(), project);
    this.defaultEnabled = this.defaultEnabled.filter((x) => x !== id);
    void this.disconnect(id);
  }

  getSessionEnabled(sessionId: string): string[] {
    const cur = this.sessionEnabled.get(sessionId);
    if (cur) return [...cur];
    return this.getDefaultEnabled().filter((id) => {
      const s = this.mergedServers().get(id);
      return s && !s.config.disabled;
    });
  }

  setSessionEnabled(sessionId: string, ids: string[]): string[] {
    const known = new Set(this.mergedServers().keys());
    const next = [...new Set(ids.filter((id) => known.has(id)))];
    this.sessionEnabled.set(sessionId, next);
    return next;
  }

  async disconnect(id: string): Promise<void> {
    const live = this.live.get(id);
    if (!live) return;
    this.live.delete(id);
    try {
      await live.client.close();
    } catch {
      /* ignore */
    }
    try {
      await live.transport.close?.();
    } catch {
      /* ignore */
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.disconnect(id)));
  }

  async connect(id: string): Promise<McpServerListItem> {
    const entry = this.mergedServers().get(id);
    if (!entry) throw new Error(`MCP server not found: ${id}`);
    if (entry.config.disabled) throw new Error(`MCP server is disabled: ${id}`);

    await this.disconnect(id);

    const live: LiveConnection = {
      client: new Client({ name: 'ciro-harness', version: '0.1.0' }),
      transport: {},
      tools: [],
      status: 'connecting',
    };
    this.live.set(id, live);

    try {
      const transport = await this.createTransport(entry.config);
      live.transport = transport;
      await live.client.connect(transport);
      const listed = await live.client.listTools();
      live.tools = (listed.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        readOnlyHint: extractReadOnlyHint(t as { annotations?: { readOnlyHint?: boolean } }),
      }));
      live.status = 'connected';
      live.error = undefined;
    } catch (err) {
      live.status = 'error';
      live.error = err instanceof Error ? err.message : String(err);
      try {
        await live.client.close();
      } catch {
        /* ignore */
      }
      throw new Error(live.error);
    }

    return this.listServers().find((s) => s.id === id)!;
  }

  /** 连通测试：连上后列出工具；keepAlive=false 时测完断开 */
  async testConnection(
    id: string,
    opts?: { keepAlive?: boolean },
  ): Promise<McpServerListItem> {
    const item = await this.connect(id);
    if (!opts?.keepAlive) {
      await this.disconnect(id);
      const listed = this.listServers().find((s) => s.id === id)!;
      return {
        ...listed,
        status: 'disconnected',
        tools: item.tools,
        error: undefined,
      };
    }
    return item;
  }

  getConnectedTools(serverIds: string[]): Array<McpToolInfo & { serverId: string; fullName: string }> {
    const out: Array<McpToolInfo & { serverId: string; fullName: string }> = [];
    for (const id of serverIds) {
      const live = this.live.get(id);
      if (!live || live.status !== 'connected') continue;
      for (const t of live.tools) {
        out.push({
          ...t,
          serverId: id,
          fullName: toolName(id, t.name),
        });
      }
    }
    return out;
  }

  /** 已连接工具表中的 readOnlyHint；未连接或未知返回 undefined */
  getReadOnlyHint(fullName: string): boolean | undefined {
    const parsed = parseMcpToolName(fullName);
    if (!parsed) return undefined;
    const live = this.live.get(parsed.serverId);
    if (!live || live.status !== 'connected') return undefined;
    const tool = live.tools.find((t) => t.name === parsed.toolName);
    return tool?.readOnlyHint;
  }

  /** 确保启用集内服务器已连接（跳过 disabled） */
  async ensureConnected(serverIds: string[]): Promise<string[]> {
    const connected: string[] = [];
    for (const id of serverIds) {
      const entry = this.mergedServers().get(id);
      if (!entry || entry.config.disabled) continue;
      const live = this.live.get(id);
      if (live?.status === 'connected') {
        connected.push(id);
        continue;
      }
      try {
        await this.connect(id);
        connected.push(id);
      } catch {
        /* leave out */
      }
    }
    return connected;
  }

  async callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    const live = this.live.get(serverId);
    if (!live || live.status !== 'connected') {
      throw new Error(`MCP server not connected: ${serverId}`);
    }
    const result = await live.client.callTool({ name, arguments: args });
    const content = Array.isArray(result.content)
      ? result.content.map((c) => {
          if (c && typeof c === 'object' && 'type' in c && (c as { type: string }).type === 'text') {
            return {
              type: 'text' as const,
              text: String((c as { text?: string }).text ?? ''),
            };
          }
          return {
            type: 'text' as const,
            text: JSON.stringify(c),
          };
        })
      : [{ type: 'text' as const, text: JSON.stringify(result) }];
    return {
      content,
      isError: Boolean(result.isError),
    };
  }

  estimateToolsTokens(serverIds: string[]): number {
    const tools = this.getConnectedTools(serverIds);
    let n = 0;
    for (const t of tools) {
      n += Math.ceil(
        (t.fullName.length + (t.description?.length ?? 0) + JSON.stringify(t.inputSchema ?? {}).length) /
          4,
      );
    }
    return n;
  }

  private async createTransport(config: McpServerConfig) {
    if (config.url) {
      const checked = await validateOutboundUrl(config.url);
      if (!checked.ok) throw new Error(checked.error);
      const fetchImpl = createSsrfFetch(5000);
      return new StreamableHTTPClientTransport(new URL(checked.url), {
        fetch: fetchImpl,
        requestInit: config.headers ? { headers: config.headers } : undefined,
      });
    }
    if (!config.command) {
      throw new Error('MCP server requires command (stdio) or url (http)');
    }
    const env = {
      ...process.env,
      ...(config.env ?? {}),
    } as Record<string, string>;
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
      cwd: config.cwd ?? this.workspace,
      stderr: 'pipe',
    });
  }
}

/** 供单测：写临时 mcp.json */
export function writeMcpConfigForTest(dir: string, cfg: McpFileConfig): string {
  const path = join(dir, '.mcp.json');
  writeConfigFile(path, cfg);
  return path;
}
