import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  policyBlockMessage,
  type McpManager,
  type ToolPolicyGate,
} from '@ciro/harness-core';

/** 将已连接 MCP server 的工具包装为 Pi ToolDefinition（名：mcp:{slug}:{tool}） */
export function buildMcpTools(
  manager: McpManager,
  serverIds: string[],
  gate?: ToolPolicyGate,
) {
  const tools = manager.getConnectedTools(serverIds);
  return tools.map((t) => {
    return defineTool({
      name: t.fullName,
      label: t.fullName,
      description: t.description ?? `MCP tool ${t.name} from ${t.serverId}`,
      // MCP inputSchema 为 JSON Schema；用 Any 承接，避免动态转换失败
      parameters: Type.Any(),
      execute: async (_toolCallId, params) => {
        const fail = (text: string) => ({
          content: [{ type: 'text' as const, text }],
          details: { error: true },
        });
        try {
          if (gate) {
            const decision = await gate(
              t.fullName,
              (params ?? {}) as Record<string, unknown>,
            );
            if (isPolicyBlocked(decision)) {
              return fail(policyBlockMessage(decision));
            }
          }
          const result = await manager.callTool(
            t.serverId,
            t.name,
            (params ?? {}) as Record<string, unknown>,
          );
          return {
            content: result.content,
            details: { error: Boolean(result.isError), mcp: true, serverId: t.serverId },
          };
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
      },
    });
  });
}

export function mcpToolNames(manager: McpManager, serverIds: string[]): string[] {
  return manager.getConnectedTools(serverIds).map((t) => t.fullName);
}

export function mcpToolsContextText(manager: McpManager, serverIds: string[]): string {
  return manager
    .getConnectedTools(serverIds)
    .map((t) => `${t.fullName}: ${t.description ?? ''}`)
    .join('\n');
}

/** 将尚未出现在 registry 的工具经 registerTool 热补；返回新注册名 */
export function registerMissingMcpTools<T extends { name: string }>(
  tools: readonly T[],
  knownNames: ReadonlySet<string>,
  registerTool: ((tool: T) => void) | null | undefined,
): string[] {
  if (!registerTool) return [];
  const added: string[] = [];
  for (const tool of tools) {
    if (knownNames.has(tool.name)) continue;
    registerTool(tool);
    added.push(tool.name);
  }
  return added;
}

/** 启用集中未成功连接的 server → id→error */
export function mcpConnectionErrors(
  manager: McpManager,
  enabledIds: string[],
): Record<string, string> {
  const byId = new Map(manager.listServers().map((s) => [s.id, s]));
  const errors: Record<string, string> = {};
  for (const id of enabledIds) {
    const s = byId.get(id);
    if (!s) {
      errors[id] = 'MCP server not found';
      continue;
    }
    if (s.status === 'connected') continue;
    errors[id] = s.error?.trim() || `MCP server status: ${s.status}`;
  }
  return errors;
}
