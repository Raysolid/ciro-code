import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  assertWritable,
  SandboxError,
  isPolicyBlocked,
  policyBlockMessage,
  buildUnifiedDiff,
  type ToolPolicyGate,
} from '@ciro/harness-core';
import type { FileChangeRecord, FileEditOperation } from '@ciro/harness-shared';

export type OnFileEdit = (
  change: FileChangeRecord,
  contents: { before: string; after: string },
) => void;

function recordChange(
  onFileEdit: OnFileEdit | undefined,
  path: string,
  operation: FileEditOperation,
  before: string,
  after: string,
  summary: string,
  toolCallId?: string,
): void {
  if (!onFileEdit) return;
  const { text, truncated } = buildUnifiedDiff(path, before, after);
  onFileEdit(
    {
      path,
      operation,
      summary,
      unifiedDiff: text,
      ts: Date.now(),
      truncated,
      toolCallId,
      disposition: 'pending',
      reviewable: true,
    },
    { before, after },
  );
}

export function createSandboxedWriteTool(
  workspace: string,
  gate?: ToolPolicyGate,
  onFileEdit?: OnFileEdit,
) {
  return defineTool({
    name: 'write',
    label: 'Write File',
    description:
      'Write content to a file within the workspace (creates parent dirs). For global user preferences use path ~/.ciro/AGENTS.md (or global:AGENTS.md).',
    parameters: Type.Object({
      path: Type.String({
        description:
          'Relative workspace path, or ~/.ciro/AGENTS.md for global preferences',
      }),
      content: Type.String({ description: 'Full file content to write' }),
    }),
    execute: async (toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, path: params.path, bytes: 0 },
      });
      try {
        if (gate) {
          const decision = await gate('write', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const abs = assertWritable(workspace, params.path);
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, params.content, 'utf-8');
        const summary = `Wrote ${params.content.length} bytes to ${params.path}`;
        recordChange(onFileEdit, params.path, 'write', before, params.content, summary, toolCallId);
        return {
          content: [{ type: 'text' as const, text: summary }],
          details: { error: false, path: params.path, bytes: params.content.length },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}

export function createSandboxedEditTool(
  workspace: string,
  gate?: ToolPolicyGate,
  onFileEdit?: OnFileEdit,
) {
  return defineTool({
    name: 'edit',
    label: 'Edit File',
    description:
      'Edit a file by replacing old_string with new_string, or replace entire content if old_string is omitted. Global preferences: ~/.ciro/AGENTS.md. Project facts: .ciro/memory/MEMORY.md. Project rules: AGENTS.md.',
    parameters: Type.Object({
      path: Type.String({
        description:
          'Relative workspace path, or ~/.ciro/AGENTS.md for global preferences',
      }),
      old_string: Type.Optional(Type.String({ description: 'Exact text to replace' })),
      new_string: Type.String({
        description: 'Replacement text (or full content if old_string omitted)',
      }),
    }),
    execute: async (toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, path: params.path, replacements: 0 },
      });
      try {
        if (gate) {
          const decision = await gate('edit', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const abs = assertWritable(workspace, params.path);
        const before = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
        let after: string;
        let replacements = 0;

        if (params.old_string != null && params.old_string.length > 0) {
          const idx = before.indexOf(params.old_string);
          if (idx < 0) {
            return fail(`old_string not found in ${params.path}`);
          }
          after =
            before.slice(0, idx) +
            params.new_string +
            before.slice(idx + params.old_string.length);
          replacements = 1;
        } else {
          after = params.new_string;
          replacements = 1;
        }

        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, after, 'utf-8');
        const beforeLines = before.split('\n').length;
        const afterLines = after.split('\n').length;
        const summary = `Edited ${params.path}: ${replacements} replacement(s), lines ${beforeLines} → ${afterLines}`;
        recordChange(onFileEdit, params.path, 'edit', before, after, summary, toolCallId);
        return {
          content: [{ type: 'text' as const, text: summary }],
          details: {
            error: false,
            path: params.path,
            replacements,
            beforeLines,
            afterLines,
          },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}
