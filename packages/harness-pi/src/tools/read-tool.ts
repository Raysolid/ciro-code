import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from 'typebox';
import {
  defineTool,
  detectSupportedImageMimeTypeFromFile,
} from '@earendil-works/pi-coding-agent';
import {
  assertReadable,
  SandboxError,
  isPolicyBlocked,
  policyBlockMessage,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';

export type SandboxedReadToolOpts = {
  /** 当前会话模型是否 Vision；缺省视为不支持 */
  getSupportsVision?: () => boolean;
};

/** 内联图片硬顶（raw bytes）；超限不投图。Pi processImage 未公开 export，不深链内部路径。 */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

function encodeWorkspaceImage(
  bytes: Buffer,
  mimeType: string,
):
  | { ok: true; data: string; mimeType: string; hints: string[] }
  | { ok: false; message: string } {
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
    return {
      ok: false,
      message: `[Image omitted: file exceeds ${MAX_INLINE_IMAGE_BYTES / (1024 * 1024)}MB inline limit.]`,
    };
  }
  const hints: string[] = [];
  if (bytes.byteLength > 1024 * 1024) {
    hints.push('[Large image; prefer a smaller asset when possible.]');
  }
  return {
    ok: true,
    data: bytes.toString('base64'),
    mimeType,
    hints,
  };
}

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

export function createSandboxedReadTool(
  workspace: string,
  gate?: ToolPolicyGate,
  opts?: SandboxedReadToolOpts,
) {
  return defineTool({
    name: 'read',
    label: 'Read File',
    description:
      'Read a file within the workspace. Supports text and images (jpg, png, gif, webp, bmp). When the user @-mentions or asks about an image path, call this tool — @path alone does not attach pixels. Images are returned as vision attachments when the model has Vision enabled. Paths must be relative to workspace root.',
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

        const mimeType = await detectSupportedImageMimeTypeFromFile(abs);
        if (mimeType) {
          const vision = opts?.getSupportsVision?.() ?? false;
          if (!vision) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Read image file [${mimeType}]\n[Current model does not support images. Enable Vision on the model, or switch to a multimodal model.]`,
                },
              ],
              details: { error: false, path: params.path, lines: 0, image: true, vision: false },
            };
          }
          const buffer = readFileSync(abs);
          const processed = encodeWorkspaceImage(buffer, mimeType);
          if (!processed.ok) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Read image file [${mimeType}]\n${processed.message}`,
                },
              ],
              details: { error: true, path: params.path, lines: 0, image: true },
            };
          }
          let textNote = `Read image file [${processed.mimeType}]`;
          if (processed.hints.length > 0) textNote += `\n${processed.hints.join('\n')}`;
          return {
            content: [
              { type: 'text' as const, text: textNote },
              {
                type: 'image' as const,
                data: processed.data,
                mimeType: processed.mimeType,
              },
            ],
            details: { error: false, path: params.path, lines: 0, image: true, vision: true },
          };
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
