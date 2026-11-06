import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  SandboxError,
  formatShellToolHint,
  isPolicyBlocked,
  policyBlockMessage,
  resolveShell,
  runSandboxed,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';

function bashToolDescription(): string {
  return (
    `Run a shell command in the workspace (cwd=workspace, timeout 30s). ` +
    formatShellToolHint(resolveShell())
  );
}

export function createSandboxedBashTool(workspace: string, gate?: ToolPolicyGate) {
  const tool = defineTool({
    name: 'bash',
    label: 'Bash',
    description: bashToolDescription(),
    parameters: Type.Object({
      command: Type.String({ description: 'Shell command to run' }),
      description: Type.Optional(
        Type.String({
          description: 'Short UI label for the command card (e.g. "List repo top-level structure")',
        }),
      ),
      timeoutMs: Type.Optional(Type.Number({ description: 'Timeout in ms (default 30000)' })),
    }),
    execute: async (toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, exitCode: null as number | null },
      });
      try {
        if (gate) {
          const decision = await gate(
            'bash',
            params as unknown as Record<string, unknown>,
            { toolCallId },
          );
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const result = await runSandboxed({
          cwd: workspace,
          command: params.command,
          timeoutMs: params.timeoutMs,
        });
        const parts = [
          result.timedOut ? '[timed out]' : `exit ${result.exitCode ?? '?'}`,
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : '',
        ].filter(Boolean);
        const text = parts.join('\n') || '(no output)';
        return {
          content: [{ type: 'text' as const, text }],
          details: {
            error: Boolean(result.timedOut || (result.exitCode !== 0 && result.exitCode != null)),
            exitCode: result.exitCode,
            timedOut: result.timedOut,
          },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
  // live getter：shell override 后 description 无需重建工具
  Object.defineProperty(tool, 'description', {
    enumerable: true,
    configurable: true,
    get: bashToolDescription,
  });
  return tool;
}
