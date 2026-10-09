import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  assertWritable,
  SandboxError,
  isPolicyBlocked,
  policyBlockMessage,
  clearDebugLog,
  type ToolPolicyGate,
} from '@ciro/harness-core';

export interface DeleteFileToolOptions {
  workspace: string;
  gate?: ToolPolicyGate;
  /** 当前 debug session 允许删除的绝对路径（仅此文件） */
  getAllowedLogPath?: () => string | undefined;
}

/** Debug 专用：仅允许清空/删除本 session 的 debug log */
export function createSandboxedDeleteFileTool(opts: DeleteFileToolOptions) {
  const { workspace, gate, getAllowedLogPath } = opts;
  return defineTool({
    name: 'delete_file',
    label: 'Delete File',
    description:
      'Delete a file. In Debug mode this may only clear the current session debug log before a new reproduction run. Do not use bash rm for debug logs.',
    parameters: Type.Object({
      path: Type.String({ description: 'Relative path within workspace' }),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, path: params.path },
      });
      try {
        if (gate) {
          const decision = await gate('delete_file', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const abs = assertWritable(workspace, params.path);
        const allowed = getAllowedLogPath?.();
        if (allowed) {
          if (resolvePath(abs) !== resolvePath(allowed)) {
            return fail(
              'delete_file is only allowed for the current debug session log path',
            );
          }
        }
        if (existsSync(abs)) {
          clearDebugLog(abs);
        }
        return {
          content: [{ type: 'text' as const, text: `Cleared ${params.path}` }],
          details: { error: false, path: params.path },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}
