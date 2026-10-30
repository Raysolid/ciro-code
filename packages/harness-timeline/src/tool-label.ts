import { TOOL_LABEL_KEYS as K } from './labels.js';
import type { TranslateFn } from './translate.js';

/** Cursor 风格工具短标（含 L 行号） */
export function toolPath(toolInput?: Record<string, unknown>): string | undefined {
  if (!toolInput) return undefined;
  if (typeof toolInput.path === 'string') return toolInput.path;
  if (typeof toolInput.file === 'string') return toolInput.file;
  if (typeof toolInput.target_file === 'string') return toolInput.target_file;
  return undefined;
}

function lineRangeLabel(toolInput?: Record<string, unknown>): string | undefined {
  if (!toolInput) return undefined;
  const start =
    num(toolInput.startLine) ??
    num(toolInput.start_line) ??
    num(toolInput.offset) ??
    num(toolInput.line);
  const end =
    num(toolInput.endLine) ??
    num(toolInput.end_line) ??
    (start != null && num(toolInput.limit) != null
      ? start + Math.max(0, num(toolInput.limit)! - 1)
      : undefined);
  if (typeof toolInput.lines === 'string' && /^\d+-\d+$/.test(toolInput.lines)) {
    return `L${toolInput.lines}`;
  }
  if (start != null && end != null && end >= start) return `L${start}-${end}`;
  if (start != null) return `L${start}`;
  return undefined;
}

export function toolLabelParts(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
  preview: string | undefined,
  t: TranslateFn,
): { verb: string; target?: string; meta?: string; path?: string; href?: string } {
  const name = toolName.toLowerCase();
  const path = toolPath(toolInput);
  const base = path ? basename(path) : undefined;
  const lines = lineRangeLabel(toolInput) ?? inferLinesFromPreview(preview);
  const pattern = typeof toolInput?.pattern === 'string' ? toolInput.pattern : undefined;
  const command = typeof toolInput?.command === 'string' ? toolInput.command : undefined;

  if (name === 'read' || name === 'read_file') {
    return { verb: t(K.verbRead), target: base, meta: lines, path };
  }
  if (name === 'webfetch') {
    const url = typeof toolInput?.url === 'string' ? toolInput.url.trim() : '';
    const href = /^https?:\/\//i.test(url) ? url : undefined;
    const target = pageTitleFromPreview(preview) ?? (url ? webFetchHost(url) : undefined);
    return { verb: t(K.verbFetched), target, href };
  }
  if (name === 'grep' || name === 'search') {
    if (pattern && path) {
      return {
        verb: t(K.verbGrepped),
        target: t(K.greppedIn, { pattern, file: base ?? path }),
        path,
      };
    }
    if (pattern) return { verb: t(K.verbGrepped), target: pattern };
    return { verb: t(K.verbGrepped) };
  }
  if (name === 'list_files' || name === 'ls' || name === 'glob') {
    return { verb: t(K.verbListed), target: path ?? t(K.targetFiles), path };
  }
  if (name === 'write') {
    return { verb: t(K.verbWrote), target: base, path };
  }
  if (name === 'edit') {
    return { verb: t(K.verbEdited), target: base, meta: lines, path };
  }
  if (name === 'delete_file' || name === 'delete') {
    return { verb: t(K.verbDeleted), target: base, path };
  }
  if (name === 'bash' || name === 'pwsh' || name === 'shell' || name === 'cmd') {
    if (command) {
      const short = command.length > 48 ? `${command.slice(0, 48)}…` : command;
      return { verb: t(K.verbRan), target: short };
    }
    return { verb: t(K.verbRan), target: t(K.targetCommand) };
  }
  if (name.startsWith('mcp:') && name.includes('browser_')) {
    const short = name.split(':').pop() ?? name;
    const url = typeof toolInput?.url === 'string' ? toolInput.url : undefined;
    if (short.includes('navigate') && url) {
      const u = url.length > 40 ? `${url.slice(0, 40)}…` : url;
      return { verb: short, target: u, href: url };
    }
    if (short.includes('snapshot')) {
      return { verb: short, target: t(K.targetSnapshot) };
    }
    return { verb: short, target: base };
  }
  return { verb: toolName, target: base, path };
}

/** 单行展示文案：Read App.tsx L330-429 */
function toolLabel(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
  t: TranslateFn,
): string {
  const { verb, target, meta } = toolLabelParts(toolName, toolInput, undefined, t);
  return [verb, target, meta].filter(Boolean).join(' ');
}

export function isShellTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === 'bash' || n === 'pwsh' || n === 'shell' || n === 'cmd';
}

/** write/edit 完成后由 diff 卡展示，不计入工具组人数 */
export function isWriteEditTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === 'write' || n === 'edit';
}

/** 仅可读文件类工具支持点击预览；list/grep/目录 不可点 */
export function isPreviewableFileTool(
  toolName: string,
  path?: string,
): boolean {
  const n = toolName.toLowerCase();
  if (n === 'list_files' || n === 'ls' || n === 'glob') return false;
  if (n === 'grep' || n === 'search') return false;
  if (n !== 'read' && n !== 'read_file' && n !== 'write' && n !== 'edit') return false;
  if (!path || !path.trim()) return false;
  const p = path.trim();
  if (p === '.' || p === './' || p === '/' || p.endsWith('/') || p.endsWith('\\')) {
    return false;
  }
  return true;
}

/** 工具组标题：Explored / Edited / Ran / Used */
export function toolGroupSummary(
  tools: { toolName: string; toolInput?: Record<string, unknown> }[],
  t: TranslateFn,
): string {
  const n = tools.length;
  if (n === 0) return '';
  if (n === 1) return toolLabel(tools[0]!.toolName, tools[0]!.toolInput, t);

  let reads = 0;
  let searches = 0;
  let edits = 0;
  let fetches = 0;
  for (const tool of tools) {
    const name = tool.toolName.toLowerCase();
    if (name === 'read' || name === 'read_file' || name === 'list_files' || name === 'ls' || name === 'glob') {
      reads += 1;
    } else if (name === 'grep' || name === 'search') {
      searches += 1;
    } else if (name === 'webfetch') {
      fetches += 1;
    } else if (name === 'edit' || name === 'write') {
      edits += 1;
    }
  }

  if (fetches === n) return t(K.groupFetched, { n });

  if (reads + searches === n && (reads > 0 || searches > 0)) {
    const parts: string[] = [];
    if (reads > 0) {
      parts.push(t(reads === 1 ? K.groupFile : K.groupFiles, { n: reads }));
    }
    if (searches > 0) {
      parts.push(t(searches === 1 ? K.groupSearch : K.groupSearches, { n: searches }));
    }
    return t(K.groupExplored, { parts: parts.join(', ') });
  }
  if (edits === n) return t(K.groupEdited, { n });
  return t(K.groupUsed, { n });
}

function webFetchHost(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '') || raw;
  } catch {
    return raw.length > 72 ? `${raw.slice(0, 71)}…` : raw;
  }
}

function pageTitleFromPreview(preview?: string): string | undefined {
  if (!preview) return undefined;
  const head = preview.split(/\n---\n/, 1)[0] ?? '';
  return head.match(/^title:\s*(.+)$/m)?.[1]?.trim() || undefined;
}

function basename(path: string): string {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

/** 从 `1|…` 样式 preview 推断 L1-N */
function inferLinesFromPreview(preview?: string): string | undefined {
  if (!preview) return undefined;
  const lined = preview
    .split('\n')
    .map((line) => line.match(/^(\d+)\|/)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  if (lined.length === 0) return undefined;
  const start = lined[0]!;
  const end = lined[lined.length - 1]!;
  return start === end ? `L${start}` : `L${start}-${end}`;
}
