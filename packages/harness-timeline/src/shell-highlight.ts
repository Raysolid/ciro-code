import { isShellTool } from './tool-label.js';
import type { ToolTimelineItem } from './types.js';

export type ShellTokenKind =
  | 'command'
  | 'flag'
  | 'string'
  | 'operator'
  | 'text';

export interface ShellToken {
  kind: ShellTokenKind;
  text: string;
}

/**
 * 轻量 shell 命令分词（bash / pwsh 通用外观），用于卡片内高亮。
 * 不做完整语法解析，只覆盖常见视觉层次：命令名 / 开关 / 字符串 / 管道。
 */
export function tokenizeShellCommand(command: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let i = 0;
  let commandSeen = false;

  const push = (kind: ShellTokenKind, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind === 'text') {
      last.text += text;
      return;
    }
    tokens.push({ kind, text });
  };

  while (i < command.length) {
    const ch = command[i]!;

    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < command.length && /\s/.test(command[j]!)) j += 1;
      push('text', command.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < command.length) {
        if (command[j] === '\\' && j + 1 < command.length) {
          j += 2;
          continue;
        }
        if (command[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      push('string', command.slice(i, j));
      i = j;
      continue;
    }

    if ('|&;<>'.includes(ch)) {
      let j = i + 1;
      if (
        (ch === '|' && command[j] === '|') ||
        (ch === '&' && command[j] === '&') ||
        (ch === '>' && command[j] === '>') ||
        (ch === '<' && command[j] === '<')
      ) {
        j += 1;
      }
      push('operator', command.slice(i, j));
      commandSeen = false; // 管道后下一段重新当作命令名
      i = j;
      continue;
    }

    // 开关：-a / --flag / -Name（pwsh）/ --reporter=dot
    if (
      ch === '-' &&
      i + 1 < command.length &&
      (command[i + 1] === '-' || /[A-Za-z?]/.test(command[i + 1]!))
    ) {
      let j = i + 1;
      while (j < command.length && /[A-Za-z0-9_?=.-]/.test(command[j]!)) j += 1;
      push('flag', command.slice(i, j));
      i = j;
      continue;
    }

    let j = i;
    while (j < command.length && !/[\s|&;<>"'`]/.test(command[j]!)) j += 1;
    const word = command.slice(i, j);
    if (!commandSeen) {
      push('command', word);
      commandSeen = true;
    } else {
      push('text', word);
    }
    i = j;
  }

  return tokens;
}

function textsFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const texts = content
    .map((c) =>
      c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string'
        ? (c as { text: string }).text
        : '',
    )
    .filter(Boolean);
  return texts.length > 0 ? texts.join('\n') : null;
}

/** 截断 JSON 字符串：解码转义，遇未转义引号或末尾停止 */
function unescapeJsonStringPrefix(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '"') break;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const n = raw[i + 1];
    if (n === undefined) break;
    i += 1;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === 'u' && i + 4 < raw.length) {
      const hex = raw.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(Number.parseInt(hex, 16));
        i += 4;
      } else {
        out += n;
      }
    } else {
      out += n;
    }
  }
  return out;
}

/** 若 preview 是工具结果 JSON 信封（含被 clip 截断的），抽出 content[].text */
export function formatShellPreview(preview: string): string {
  const trimmed = preview.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"content"')) return preview;
  try {
    const parsed = JSON.parse(trimmed) as { content?: unknown };
    const text = textsFromContent(parsed.content);
    if (text) return text;
  } catch {
    const m = trimmed.match(/"text"\s*:\s*"/);
    if (!m || m.index == null) return preview;
    const extracted = unescapeJsonStringPrefix(trimmed.slice(m.index + m[0].length));
    if (extracted) return extracted;
  }
  return preview;
}

/** 命令卡只展示 stdout/stderr 正文，去掉 exit / 流标签 */
export function formatShellCardOutput(preview: string): string {
  let text = formatShellPreview(preview).replace(/\r\n/g, '\n');
  text = text.replace(/^(?:\[timed out\]|exit \S+)\n?/, '');
  text = text.replace(/^(?:stdout|stderr):\n/gim, '');
  return text.replace(/^\n+|\n+$/g, '');
}

/** 有 description 时，meta 取首个可执行名（如 pnpm） */
export function shellCommandMeta(
  command: string,
  toolName: string,
  hasDescription: boolean,
): string {
  if (!hasDescription) return toolName;
  const tokens = tokenizeShellCommand(command);
  const cmd = tokens.find((t) => t.kind === 'command');
  if (cmd?.text) {
    const base = cmd.text.replace(/^.*[/\\]/, '');
    return base || toolName;
  }
  return toolName;
}

export type ShellPermissionMatch = {
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
  permissionId?: string;
};

/** 当前 permission 是否对应此 shell 卡片（等确认态；优先 toolCallId） */
export function matchesShellPermission(
  item: ToolTimelineItem,
  permission: ShellPermissionMatch | null | undefined,
): boolean {
  if (!permission || !isShellTool(permission.toolName) || !isShellTool(item.toolName)) {
    return false;
  }
  if (item.status !== 'running') return false;
  if (permission.toolCallId) {
    return item.id === permission.toolCallId;
  }
  const permCmd =
    typeof permission.toolInput?.command === 'string' ? permission.toolInput.command : undefined;
  const itemCmd =
    typeof item.toolInput?.command === 'string' ? item.toolInput.command : '';
  if (permCmd && itemCmd) return permCmd === itemCmd;
  return permission.toolName.toLowerCase() === item.toolName.toLowerCase();
}

/** 从挂起队列中找出匹配该 tool 卡的权限（支持并行多卡确认） */
export function findShellPermission<T extends ShellPermissionMatch>(
  item: ToolTimelineItem,
  permissions: readonly T[] | null | undefined,
): T | undefined {
  if (!permissions?.length) return undefined;
  return permissions.find((p) => matchesShellPermission(item, p));
}
