import type { HarnessMode } from '@ciro-code/harness-shared';
import {
  formatShellCardOutput,
  groupTimelineForView,
  isShellTool,
  shellCommandMeta,
  timelineActivityItems,
  tokenizeShellCommand,
  toolLabelParts,
  type ChatMessage,
  type ShellToken,
  type TimelineViewNode,
  type ToolTimelineItem,
} from '@ciro-code/harness-timeline';
import { stringWidth, truncateToWidth, wrapToWidth } from '../width/measure.js';
import type { ColorSlot, StyledLine, StyledSegment } from '../tui-kit/types.js';
import { tuiTranslate } from './tui-translate.js';

/** 对话区左缩进（贴 Grok 侧边留白，勿贴边） */
const CONTENT_INDENT = 2;
/** `> ` 宽度；命令卡正文与 header 的 Ran 对齐 */
const TOOL_PREFIX_W = 2;
const SHELL_CARD_PAD = CONTENT_INDENT + TOOL_PREFIX_W;

function indentLine(line: StyledLine, pad = CONTENT_INDENT): StyledLine {
  if (pad <= 0) return line;
  return [{ text: ' '.repeat(pad) }, ...line];
}

/** 通栏浅底行（命令展开卡）；正文从 pad 列起 */
function cardLine(segs: StyledSegment[], width: number, pad: number): StyledLine {
  const bg: ColorSlot = 'userBg';
  const out: StyledSegment[] = [{ text: ' '.repeat(Math.max(0, pad)), bg }];
  let used = pad;
  for (const s of segs) {
    if (used >= width) break;
    const t = truncateToWidth(s.text, width - used);
    out.push({ ...s, text: t, bg: s.bg ?? bg });
    used += stringWidth(t);
  }
  if (used < width) out.push({ text: ' '.repeat(width - used), bg });
  return out;
}

export interface MessagesToLinesOptions {
  streaming?: boolean;
  /** 展开的 timeline / toolGroup id */
  expandedIds?: ReadonlySet<string>;
  /** 鼠标悬停的 timeline id（行变亮） */
  hoveredId?: string | null;
  /** 驱动闪烁 / 活动条 spinner */
  animTick?: number;
  nowMs?: number;
}

export interface MessagesRender {
  lines: StyledLine[];
  toggles: Array<{ line: number; id: string }>;
  /** 末轮用户气泡在 lines 中的半开区间 [start, end)，供吸顶 */
  stickyUserRange: { start: number; end: number } | null;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const GAP: StyledLine = [{ text: '' }];

export function spinnerGlyph(tick = 0): string {
  return SPINNER[Math.floor(Math.max(0, tick) / 2) % SPINNER.length]!;
}

export function formatModeLabel(mode: HarnessMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/** 运行中文案闪烁：约 240ms 一拍（tick≈80ms ×3） */
export function blinkOn(tick = 0): boolean {
  return Math.floor(Math.max(0, tick) / 3) % 2 === 0;
}

function bandRow(bandW: number): StyledLine {
  return [{ text: ' '.repeat(Math.max(0, bandW)), bg: 'userBg' }];
}

/** 用户条带：背景通栏；提示符与文字在带内左缩进 */
function userBandLines(content: string, width: number): StyledLine[] {
  const bandW = Math.max(8, width);
  const text = content.replace(/\n/g, ' ');
  const padL = CONTENT_INDENT;
  const prompt = '❯ ';
  const budget = Math.max(1, bandW - padL - stringWidth(prompt));
  const body = truncateToWidth(text, budget);
  const segs: StyledSegment[] = [
    { text: ' '.repeat(padL), bg: 'userBg' },
    { text: prompt, fg: 'text', bg: 'userBg' },
    { text: body, fg: 'text', bg: 'userBg', bold: true },
  ];
  const used = padL + stringWidth(prompt) + stringWidth(body);
  if (used < bandW) {
    segs.push({ text: ' '.repeat(bandW - used), bg: 'userBg' });
  }
  return [bandRow(bandW), segs, bandRow(bandW)];
}

function wrapBody(text: string, width: number): string[] {
  const rows = wrapToWidth(text.replace(/^\s+|\s+$/g, ''), width);
  while (rows.length > 0 && !rows[0]!.trim()) rows.shift();
  while (rows.length > 0 && !rows[rows.length - 1]!.trim()) rows.pop();
  return rows;
}

function thoughtSec(
  item: { durationSec?: number; startedAt: number; ended?: boolean },
  nowMs: number,
): number {
  if (item.ended && item.durationSec != null) return item.durationSec;
  return Math.max(1, Math.round((nowMs - item.startedAt) / 1000));
}

function formatThoughtHeader(
  item: { durationSec?: number; startedAt: number; ended?: boolean },
  opts: { running: boolean; nowMs: number; expanded: boolean },
): string {
  const sec = thoughtSec(item, opts.nowMs);
  const mark = opts.expanded ? '▾' : '▸';
  if (opts.running) return `${mark} Thinking… (${sec}s)`;
  return `${mark} Thought for ${sec}s`;
}

/** 组头/工具行：失败不整行标红（末尾 ×）；运行中闪烁；hover/展开只加亮文字 */
function toolStatusFg(
  status: 'running' | 'done' | 'error',
  tick: number,
  lit: boolean,
): { fg: ColorSlot; dim?: boolean; bold?: boolean } {
  if (status === 'running') {
    return blinkOn(tick) ? { fg: lit ? 'text' : 'textMuted', bold: true } : { fg: 'textMuted', dim: true };
  }
  if (lit) return { fg: 'text', bold: true };
  return { fg: 'textMuted' };
}

/** 内部行前缀：> */
function toolPrefix(): string {
  return '>';
}

function failMark(status: 'running' | 'done' | 'error'): StyledSegment | null {
  if (status !== 'error') return null;
  return { text: ' ×', fg: 'danger', bold: true };
}

function shellCommand(tool: ToolTimelineItem): string {
  return typeof tool.toolInput?.command === 'string' ? tool.toolInput.command : '';
}

/** 命令行 header：Ran + 短名，不展示完整命令 */
function shellHeaderLabel(tool: ToolTimelineItem): { verb: string; meta: string } {
  const { verb } = toolLabelParts(tool.toolName, tool.toolInput, tool.preview, tuiTranslate);
  const cmd = shellCommand(tool);
  const hasDesc =
    typeof tool.toolInput?.description === 'string' &&
    Boolean((tool.toolInput.description as string).trim());
  const meta = shellCommandMeta(cmd, tool.toolName, hasDesc);
  return { verb, meta };
}

const TOKEN_FG: Record<ShellToken['kind'], ColorSlot> = {
  command: 'success',
  flag: 'link',
  string: 'warning',
  operator: 'warning',
  text: 'text',
};

export function deriveStreamActivity(messages: ChatMessage[]): string {
  const ast = [...messages].reverse().find((m) => m.role === 'assistant' && m.status === 'streaming');
  if (!ast) return 'Planning next move…';
  const tl = ast.timeline ?? [];
  const last = tl[tl.length - 1];
  if (!last) return 'Planning next move…';
  if (last.kind === 'thought' && !last.ended) return 'Thinking…';
  if (last.kind === 'tool' && last.status === 'running') {
    return last.toolName ? `Running ${last.toolName}…` : 'Running…';
  }
  if (last.kind === 'text') return 'Responding…';
  if (last.kind === 'tool' && last.status !== 'running') return 'Planning next move…';
  if (last.kind === 'thought' && last.ended) return 'Planning next move…';
  return 'Working…';
}

type BlockKind = 'user' | 'thought' | 'tool' | 'text' | 'compaction';

/** verb 与 target/meta 分色；失败末尾追加红色 × */
function toolLabelSegs(
  tool: ToolTimelineItem,
  opts: {
    lit: boolean;
    tick: number;
    maxW: number;
    prefix?: string;
    /** shell header：不展示完整命令 */
    shellHeader?: boolean;
  },
): StyledSegment[] {
  const st = toolStatusFg(tool.status, opts.tick, opts.lit);
  const verbFg: ColorSlot = opts.lit ? 'text' : 'textMuted';
  const targetFg: ColorSlot = opts.lit ? 'text' : 'code';
  const pref = opts.prefix ?? '';
  const fail = failMark(tool.status);
  const failW = fail ? stringWidth(fail.text) : 0;
  const budget = Math.max(1, opts.maxW - failW);

  let verb: string;
  let target: string | undefined;
  let meta: string | undefined;
  if (opts.shellHeader) {
    const h = shellHeaderLabel(tool);
    verb = h.verb;
    target = undefined;
    meta = h.meta;
  } else {
    const p = toolLabelParts(tool.toolName, tool.toolInput, tool.preview, tuiTranslate);
    verb = p.verb;
    target = p.target;
    meta = p.meta;
  }

  const segs: StyledSegment[] = [];
  let used = 0;
  const push = (text: string, fg: ColorSlot, extra?: Partial<StyledSegment>) => {
    if (!text || used >= budget) return;
    const t = truncateToWidth(text, budget - used);
    segs.push({ text: t, fg, bold: st.bold, dim: st.dim, ...extra });
    used += stringWidth(t);
  };
  if (pref) push(pref, verbFg);
  push(verb, verbFg);
  if (target) {
    push(' ', verbFg);
    push(target, targetFg, { bold: opts.lit || undefined });
  }
  if (meta) {
    push(' ', verbFg);
    push(meta, 'textMuted');
  }
  if (fail) segs.push(fail);
  return segs;
}

function highlightedCommandSegs(command: string, maxW: number): StyledSegment[] {
  const tokens = tokenizeShellCommand(command);
  const segs: StyledSegment[] = [];
  let used = 0;
  for (const tok of tokens) {
    if (used >= maxW) break;
    const t = truncateToWidth(tok.text, maxW - used);
    segs.push({ text: t, fg: TOKEN_FG[tok.kind] });
    used += stringWidth(t);
  }
  return segs;
}

/**
 * 命令展开卡：通栏浅底 + 内边距；`$ 命令` 与输出与上方 Ran 对齐。
 */
function shellCardLines(tool: ToolTimelineItem, width: number): StyledLine[] {
  const bandW = Math.max(8, width);
  const pad = SHELL_CARD_PAD;
  const contentW = Math.max(1, bandW - pad);
  const cmd = shellCommand(tool);
  const outText = tool.preview ? formatShellCardOutput(tool.preview) : '';
  const errored = tool.status === 'error';
  const lines: StyledLine[] = [];

  lines.push(cardLine([], bandW, 0)); // 顶边距（通栏）

  if (cmd) {
    const dollarW = 2;
    const cmdBudget = Math.max(1, contentW - dollarW);
    const oneLine = cmd.replace(/\s+/g, ' ').trim();
    const cmdSegs = highlightedCommandSegs(oneLine, cmdBudget);
    lines.push(
      cardLine([{ text: '$ ', fg: 'textMuted' }, ...cmdSegs], bandW, pad),
    );
  }

  if (outText.trim()) {
    const fg: ColorSlot = errored ? 'danger' : 'textMuted';
    for (const row of wrapBody(outText, contentW).slice(0, 12)) {
      lines.push(cardLine([{ text: row, fg }], bandW, pad));
    }
  } else if (tool.status === 'running') {
    lines.push(cardLine([{ text: '…', fg: 'textMuted', dim: true }], bandW, pad));
  }

  lines.push(cardLine([], bandW, 0)); // 底边距
  return lines;
}

function renderSingleTool(
  tool: ToolTimelineItem,
  toggleId: string,
  width: number,
  opts: { expanded: boolean; hovered: boolean; tick: number; streaming: boolean },
): { lines: StyledLine[]; headerLine: number } {
  const innerW = Math.max(1, width - CONTENT_INDENT);
  const lit = opts.expanded || opts.hovered;
  const active = tool.status === 'running';
  const shell = isShellTool(tool.toolName);
  const open = opts.expanded || (active && opts.streaming && shell);
  const pref = `${toolPrefix()} `;
  const segs = toolLabelSegs(tool, {
    lit,
    tick: opts.tick,
    maxW: innerW,
    prefix: pref,
    shellHeader: shell,
  });
  const lines: StyledLine[] = [indentLine(segs)];

  if (open && shell) {
    lines.push(...shellCardLines(tool, width));
  } else if (open && tool.preview) {
    // 非 shell：展开时仍用通栏卡展示 preview
    const body = formatShellCardOutput(tool.preview);
    if (body.trim()) {
      lines.push(cardLine([], width, 0));
      for (const row of wrapBody(body, Math.max(1, width - SHELL_CARD_PAD)).slice(0, 8)) {
        lines.push(
          cardLine(
            [{ text: row, fg: tool.status === 'error' ? 'danger' : 'textMuted' }],
            width,
            SHELL_CARD_PAD,
          ),
        );
      }
      lines.push(cardLine([], width, 0));
    }
  }

  void toggleId;
  return { lines, headerLine: 0 };
}

function renderToolGroup(
  node: Extract<TimelineViewNode, { type: 'toolGroup' }>,
  width: number,
  opts: {
    expanded: boolean;
    hovered: boolean;
    tick: number;
    streaming: boolean;
  },
): { lines: StyledLine[]; headerLine: number } {
  const { tools } = node;
  // 单条 Tool：无折叠三角，直接 > 行；可点开展开结果卡
  if (tools.length === 1) {
    return renderSingleTool(tools[0]!, node.id, width, opts);
  }

  const active = tools.some((t) => t.status === 'running');
  const open = opts.expanded || (active && opts.streaming);
  const lit = opts.expanded || opts.hovered;
  const mark = open ? '▾' : '▸';
  const summary =
    node.summary ||
    (tools[0]
      ? (() => {
          const p = toolLabelParts(
            tools[0]!.toolName,
            tools[0]!.toolInput,
            tools[0]!.preview,
            tuiTranslate,
          );
          return [p.verb, p.target, p.meta].filter(Boolean).join(' ');
        })()
      : 'Tools');
  const innerW = Math.max(1, width - CONTENT_INDENT);
  const headText = truncateToWidth(`${mark} ${summary}`, innerW);
  const headStyle = toolStatusFg(active ? 'running' : 'done', opts.tick, lit);
  const lines: StyledLine[] = [indentLine([{ text: headText, ...headStyle }])];
  const headerLine = 0;

  if (open) {
    for (const tool of tools) {
      const segs = toolLabelSegs(tool, {
        lit: false,
        tick: opts.tick,
        maxW: Math.max(1, innerW - 2),
        prefix: `${toolPrefix()} `,
      });
      lines.push(indentLine([{ text: '  ' }, ...segs]));
    }
  } else if (active) {
    const live = tools.find((t) => t.status === 'running') ?? tools[tools.length - 1]!;
    const segs = toolLabelSegs(live, {
      lit: false,
      tick: opts.tick,
      maxW: Math.max(1, innerW - 2),
      prefix: `${toolPrefix()} `,
    });
    lines.push(indentLine([{ text: '  ' }, ...segs]));
  }

  return { lines, headerLine };
}

/** 消息 → 虚拟 scrollback 行 */
export function messagesToLines(
  messages: ChatMessage[],
  width: number,
  opts: MessagesToLinesOptions = {},
): MessagesRender {
  const lines: StyledLine[] = [];
  const toggles: Array<{ line: number; id: string }> = [];
  const expanded = opts.expandedIds ?? new Set<string>();
  const hoveredId = opts.hoveredId ?? null;
  const nowMs = opts.nowMs ?? Date.now();
  const tick = opts.animTick ?? 0;
  const streaming = opts.streaming ?? false;

  let prevBlock: BlockKind | null = null;
  let stickyUserRange: { start: number; end: number } | null = null;

  const gapBefore = (kind: BlockKind) => {
    if (prevBlock === null) {
      lines.push(GAP);
    } else if (prevBlock !== kind) {
      lines.push(GAP);
    } else if (kind === 'user') {
      lines.push(GAP);
    }
    prevBlock = kind;
  };

  for (let mi = 0; mi < messages.length; mi++) {
    const m = messages[mi]!;

    if (m.role === 'user') {
      gapBefore('user');
      const start = lines.length;
      lines.push(...userBandLines(m.content, width));
      stickyUserRange = { start, end: lines.length };
      continue;
    }
    if (m.role === 'compaction') {
      gapBefore('compaction');
      const method = m.compaction?.method ?? 'compact';
      const saved =
        typeof m.compaction?.tokensSaved === 'number' && m.compaction.tokensSaved > 0
          ? ` · ~${m.compaction.tokensSaved} saved`
          : '';
      const innerW = Math.max(1, width - CONTENT_INDENT);
      lines.push(
        indentLine([
          {
            text: truncateToWidth(`— Context compacted (${method})${saved} —`, innerW),
            fg: 'textMuted',
            dim: true,
          },
        ]),
      );
      continue;
    }

    const nodes = groupTimelineForView(timelineActivityItems(m), tuiTranslate);
    const hasTimelineText = nodes.some((n) => n.type === 'text');
    const innerW = Math.max(1, width - CONTENT_INDENT);

    for (const node of nodes) {
      if (node.type === 'thought') {
        gapBefore('thought');
        const item = node.item;
        const isOpen = expanded.has(item.id);
        const hovered = hoveredId === item.id;
        const lit = isOpen || hovered;
        const running = !item.ended && m.status === 'streaming';
        const head = formatThoughtHeader(item, { running, nowMs, expanded: isOpen });
        toggles.push({ line: lines.length, id: item.id });
        const style = running
          ? blinkOn(tick)
            ? ({ fg: lit ? ('text' as const) : ('thinking' as const), bold: true })
            : ({ fg: 'textMuted' as const })
          : lit
            ? ({ fg: 'text' as const, bold: true })
            : ({ fg: 'thinking' as const });
        lines.push(
          indentLine([{ text: truncateToWidth(head, innerW), ...style }]),
        );
        if (isOpen && item.text) {
          for (const row of wrapBody(item.text, Math.max(1, innerW - 2))) {
            lines.push(
              indentLine([
                {
                  text: truncateToWidth(`  ${row}`, innerW),
                  fg: 'thinking',
                },
              ]),
            );
          }
        }
      } else if (node.type === 'toolGroup') {
        gapBefore('tool');
        const isOpen = expanded.has(node.id);
        const hovered = hoveredId === node.id;
        const rendered = renderToolGroup(node, width, {
          expanded: isOpen,
          hovered,
          tick,
          streaming: streaming && m.status === 'streaming',
        });
        toggles.push({ line: lines.length + rendered.headerLine, id: node.id });
        lines.push(...rendered.lines);
      } else if (node.type === 'text' && node.item.text) {
        const rows = wrapBody(node.item.text, innerW);
        if (!rows.length) continue;
        gapBefore('text');
        for (const row of rows) {
          lines.push(indentLine([{ text: row, fg: 'text' }]));
        }
      } else if (node.type === 'diff') {
        gapBefore('tool');
        const d = node.item;
        lines.push(
          indentLine([
            {
              text: truncateToWidth(`> ${d.operation} ${d.path}  ${d.summary}`, innerW),
              fg: 'textMuted',
            },
          ]),
        );
      }
    }

    if (!hasTimelineText && m.content) {
      const rows = wrapBody(m.content, innerW);
      if (rows.length) {
        gapBefore('text');
        for (const row of rows) {
          lines.push(indentLine([{ text: row, fg: 'text' }]));
        }
      }
    }
  }

  return { lines, toggles, stickyUserRange };
}
