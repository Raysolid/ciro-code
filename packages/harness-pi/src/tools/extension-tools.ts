import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  policyBlockMessage,
  type ExtensionHost,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';
import { registerMissingMcpTools } from './mcp-tools.js';

export function buildExtensionTools(host: ExtensionHost | undefined, gate?: ToolPolicyGate) {
  if (!host) return [];
  return host.listTools().map((t) => {
    return defineTool({
      name: t.fullName,
      label: t.fullName,
      description: t.description,
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
          const result = await t.execute((params ?? {}) as Record<string, unknown>);
          const text =
            typeof result === 'string' ? result : JSON.stringify(result ?? '');
          return {
            content: [{ type: 'text' as const, text }],
            details: { error: false },
          };
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
      },
    });
  });
}

export function registerMissingExtTools(
  tools: ReturnType<typeof buildExtensionTools>,
  knownNames: ReadonlySet<string>,
  registerTool: ((tool: (typeof tools)[number]) => void) | null | undefined,
): string[] {
  return registerMissingMcpTools(tools, knownNames, registerTool);
}
