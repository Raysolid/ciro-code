import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  assertReadable,
  isPolicyBlocked,
  policyBlockMessage,
  SandboxError,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage']);

function listRecursive(
  workspace: string,
  dir: string,
  depth: number,
  maxDepth: number,
  maxEntries: number,
  out: string[],
): void {
  if (out.length >= maxEntries || depth > maxDepth) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= maxEntries) return;
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    const rel = relative(workspace, abs).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      out.push(`${rel}/`);
      listRecursive(workspace, abs, depth + 1, maxDepth, maxEntries, out);
    } else {
      out.push(rel);
    }
  }
}

export function createSandboxedListFilesTool(workspace: string, gate?: ToolPolicyGate) {
  return defineTool({
    name: 'list_files',
    label: 'List Files',
    description: 'List files and directories within the workspace (read-only).',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Relative directory path (default: workspace root)' })),
      maxDepth: Type.Optional(Type.Number({ description: 'Max recursion depth (default: 3)' })),
      maxEntries: Type.Optional(Type.Number({ description: 'Max entries to return (default: 200)' })),
    }),
    execute: async (_toolCallId, params) => {
      const relPath = params.path ?? '.';
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, path: relPath, count: 0 },
      });
      try {
        if (gate) {
          const decision = await gate('list_files', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        const abs = assertReadable(workspace, relPath);
        const st = statSync(abs);
        if (!st.isDirectory()) {
          return fail(`Not a directory: ${relPath}`);
        }
        const maxDepth = params.maxDepth ?? 3;
        const maxEntries = params.maxEntries ?? 200;
        const out: string[] = [];
        listRecursive(workspace, abs, 0, maxDepth, maxEntries, out);
        const text = out.length === 0 ? '(empty)' : out.join('\n');
        return {
          content: [{ type: 'text' as const, text }],
          details: { error: false, path: relPath, count: out.length },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}
