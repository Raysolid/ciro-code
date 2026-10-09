import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  assertReadable,
  isDeniedPath,
  isPolicyBlocked,
  policyBlockMessage,
  resolveWorkspacePath,
  SandboxError,
  type ToolPolicyGate,
} from '@ciro/harness-core';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage']);
const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.xml',
  '.java',
  '.py',
  '.go',
  '.rs',
  '.toml',
  '.sh',
  '.ps1',
]);

interface GrepHit {
  path: string;
  line: number;
  text: string;
}

function walkFiles(workspace: string, dir: string, out: string[], maxFiles: number): void {
  if (out.length >= maxFiles) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= maxFiles) return;
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkFiles(workspace, join(dir, entry.name), out, maxFiles);
    } else {
      const abs = join(dir, entry.name);
      if (isDeniedPath(abs)) continue;
      const ext = extname(entry.name).toLowerCase();
      if (TEXT_EXTS.size > 0 && ext && !TEXT_EXTS.has(ext)) continue;
      out.push(abs);
    }
  }
}

export function createSandboxedGrepTool(workspace: string, gate?: ToolPolicyGate) {
  return defineTool({
    name: 'grep',
    label: 'Grep',
    description: 'Search file contents in the workspace with a regex pattern (read-only).',
    parameters: Type.Object({
      pattern: Type.String({ description: 'JavaScript regex pattern' }),
      path: Type.Optional(Type.String({ description: 'Relative directory or file to search (default: root)' })),
      maxMatches: Type.Optional(Type.Number({ description: 'Max matches to return (default: 50)' })),
      caseInsensitive: Type.Optional(Type.Boolean({ description: 'Case-insensitive search' })),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true, matches: 0 },
      });
      try {
        if (gate) {
          const decision = await gate('grep', params as unknown as Record<string, unknown>);
          if (isPolicyBlocked(decision)) {
            return fail(policyBlockMessage(decision));
          }
        }
        let regex: RegExp;
        try {
          regex = new RegExp(params.pattern, params.caseInsensitive ? 'i' : undefined);
        } catch {
          return fail(`Invalid regex: ${params.pattern}`);
        }

        const relRoot = params.path ?? '.';
        const absRoot = assertReadable(workspace, relRoot);
        const maxMatches = params.maxMatches ?? 50;
        const files: string[] = [];
        const st = statSync(absRoot);
        if (st.isFile()) {
          files.push(absRoot);
        } else {
          walkFiles(workspace, absRoot, files, 500);
        }

        const hits: GrepHit[] = [];
        for (const file of files) {
          if (hits.length >= maxMatches) break;
          let content: string;
          try {
            content = readFileSync(file, 'utf-8');
          } catch {
            continue;
          }
          const lines = content.split('\n');
          const rel = relative(resolveWorkspacePath(workspace, '.'), file).replace(/\\/g, '/');
          for (let i = 0; i < lines.length; i++) {
            if (hits.length >= maxMatches) break;
            const line = lines[i]!;
            if (regex.test(line)) {
              hits.push({ path: rel, line: i + 1, text: line.slice(0, 200) });
            }
          }
        }

        if (hits.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No matches found' }],
            details: { error: false, matches: 0 },
          };
        }
        const text = hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n');
        return {
          content: [{ type: 'text' as const, text }],
          details: { error: false, matches: hits.length },
        };
      } catch (err) {
        const msg = err instanceof SandboxError ? err.message : String(err);
        return fail(`Error: ${msg}`);
      }
    },
  });
}
