import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  assertReadable,
  SandboxError,
  isPolicyBlocked,
  policyBlockMessage,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';

/** 误用 workspace 根路径读记忆时，回退到 .ciro/memory（兼容旧 .pi/memory） */
function resolveMemoryFallback(workspace: string, path: string): string | null {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  let rel: string | null = null;
  if (p === 'MEMORY.md' || p.endsWith('/MEMORY.md')) rel = 'MEMORY.md';
  else if (p.startsWith('memory/')) rel = p.slice('memory/'.length);
  else if (/^(user|project|feedback|reference)\//.test(p)) rel = p;
  if (!rel) return null;
  for (const base of [join('.ciro', 'memory', rel), join('.pi', 'memory', rel)]) {
    try {
      const abs = assertReadable(workspace, base);
      if (existsSync(abs)) return abs;
    } catch {
      /* try next */
    }
  }
  try {
    return assertReadable(workspace, join('.ciro', 'memory', rel));
  } catch {
    return null;
  }
}

export function createSandboxedReadTool(workspace: string, gate?: ToolPolicyGate) {
  return defineTool({
    name: 'read',
    label: 'Read File',
    description: 'Read a file within the workspace. Paths must be relative to workspace root.',
    parameters: Type.Object({
      path: Type.String({ description: 'Relative file path within workspace' }),
      offset: Type.Optional(Type.Number({ description: 'Start line (1-based)' })),
      limit: Type.Optional(Type.Number({ description: 'Max lines to read' })),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, path: params.path, lines: 0 },
      });
      try {
        if (gate) {
          const decision = await gate('read', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        let abs = assertReadable(workspace, params.path);
        if (!existsSync(abs)) {
          const fallback = resolveMemoryFallback(workspace, params.path);
          if (fallback && existsSync(fallback)) {
            abs = fallback;
          } else {
            return fail(`File not found: ${params.path}`);
          }
        }
        const content = readFileSync(abs, 'utf-8');
        const lines = content.split('\n');
        const offset = params.offset ?? 1;
        const limit = params.limit ?? lines.length;
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        const numbered = slice
          .map((line, i) => `${String(offset + i).padStart(6)}|${line}`)
          .join('\n');
        return {
          content: [{ type: 'text' as const, text: numbered || '(empty file)' }],
          details: { error: false, path: params.path, lines: slice.length },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}
