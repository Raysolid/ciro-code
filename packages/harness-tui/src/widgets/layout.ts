import type { HarnessMode } from '@ciro-code/harness-shared';
import type { ChatMessage, PermissionRequestState } from '@ciro-code/harness-timeline';
import { stringWidth, truncateToWidth } from '../width/measure.js';
import { truncateStyledLine } from '../tui-kit/styled-line.js';
import type { ColorSlot, HitTarget, StyledLine, StyledSegment } from '../tui-kit/types.js';
import {
  approvalChoices,
  buildChoicePanel,
  padChoiceTitle,
} from './choice-panel.js';
import { buildComposerBox } from './composer.js';
import {
  deriveStreamActivity,
  messagesToLines,
  spinnerGlyph,
} from './render-messages.js';
import { buildWelcomePanel } from './welcome.js';

export interface LayoutInput {
  width: number;
  height: number;
  messages: ChatMessage[];
  input: string;
  mode: HarnessMode;
  modelLabel: string;
  branch?: string | null;
  ctxPct?: number | null;
  follow: boolean;
  scrollOffset: number;
  permission: PermissionRequestState | null;
  /** 权限/提问面板当前选项下标 */
  overlayIndex?: number;
  autocomplete: 'slash' | 'mention' | null;
  welcome: boolean;
  streaming: boolean;
  workedSec?: number | null;
  mouseHint: boolean;
  focus?: 'composer' | 'scrollback';
  workspaceLabel?: string | null;
  expandedIds?: ReadonlySet<string>;
  hoveredId?: string | null;
  /** 多行粘贴块原文（composer chip） */
  pasteBlocks?: ReadonlyMap<number, string>;
  animTick?: number;
  nowMs?: number;
}

export interface LayoutResult {
  lines: StyledLine[];
  hits: HitTarget[];
  composerRow: number;
  /** composer 框顶行（╭）；无 composer 时 -1 */
  composerBoxTopRow: number;
  composerBodyRowCount: number;
  composerWidth: number;
}

const MODES: HarnessMode[] = ['agent', 'plan', 'ask', 'debug'];

export function cycleMode(current: HarnessMode): HarnessMode {
  const i = MODES.indexOf(current);
  return MODES[(i + 1) % MODES.length]!;
}

function ctxFg(pct: number): ColorSlot {
  if (pct >= 85) return 'warning';
  if (pct < 70) return 'textMuted';
  return 'text';
}

/**
 * 对话区与 Composer 之间的常驻 dock 行（贴图3 间隔区）：
 * 左侧流式活动 / 空；右侧 ctx · branch · follow。
 */
function buildDockRow(input: LayoutInput): StyledLine {
  const rightFields: { text: string; fg: ColorSlot }[] = [];
  if (input.ctxPct != null) {
    rightFields.push({ text: `ctx ${input.ctxPct}%`, fg: ctxFg(input.ctxPct) });
  }
  if (input.branch) {
    rightFields.push({ text: input.branch, fg: 'textMuted' });
  }
  if (!input.follow) {
    rightFields.push({ text: '▼follow', fg: 'warning' });
  }

  const rightSegs: StyledSegment[] = [];
  rightFields.forEach((f, i) => {
    if (i > 0) rightSegs.push({ text: ' · ', fg: 'textMuted', dim: true });
    rightSegs.push({ text: f.text, fg: f.fg });
  });
  const rightPlain = rightSegs.map((s) => s.text).join('');
  const rightW = stringWidth(rightPlain);

  const leftSegs: StyledSegment[] = [];
  if (input.streaming) {
    const tick = input.animTick ?? 0;
    const label = deriveStreamActivity(input.messages);
    const spin = `${spinnerGlyph(tick)} `;
    const elapsed =
      input.workedSec != null && input.workedSec > 0 ? `  ${input.workedSec}s` : '';
    const maxLeft = Math.max(1, input.width - rightW - (rightW > 0 ? 2 : 0));
    const body = truncateToWidth(`${label}${elapsed}`, Math.max(1, maxLeft - stringWidth(spin)));
    leftSegs.push({ text: spin, fg: 'accent', bold: true });
    leftSegs.push({ text: body, fg: 'text' });
  }

  const leftPlain = leftSegs.map((s) => s.text).join('');
  const leftW = stringWidth(leftPlain);
  const gap = Math.max(1, input.width - leftW - rightW);

  const segs: StyledSegment[] = [...leftSegs];
  if (rightW > 0) {
    segs.push({ text: ' '.repeat(gap) });
    segs.push(...rightSegs);
  } else if (leftW < input.width) {
    segs.push({ text: ' '.repeat(input.width - leftW) });
  }

  if (!segs.length) {
    return [{ text: ' '.repeat(input.width) }];
  }
  const plain = segs.map((s) => s.text).join('');
  if (stringWidth(plain) > input.width) {
    return truncateStyledLine(segs, input.width);
  }
  return segs;
}

function buildShortcuts(input: LayoutInput): StyledLine {
  if (input.width < 60) {
    return shortcutSegments([
      ['?', ''],
      ['/', ''],
      ['@', ''],
      ['Tab', ''],
      ['Esc', ''],
    ]);
  }
  if (input.width < 80) {
    return shortcutSegments([
      ['?', 'help'],
      ['/', ''],
      ['@', ''],
      ['Tab', ''],
      ['Esc', ''],
    ]);
  }
  const items: [string, string][] = [
    ['?', 'help'],
    ['/', 'commands'],
    ['@', 'files'],
    ['Tab', 'browse'],
    ['^J', 'nl'],
    ['Esc', 'stop'],
  ];
  if (input.mouseHint) items.push(['drag', 'sel']);
  return shortcutSegments(items);
}

function shortcutSegments(items: [string, string][]): StyledLine {
  const segs: StyledSegment[] = [];
  items.forEach(([key, label], i) => {
    if (i > 0) segs.push({ text: '  ', fg: 'textMuted', dim: true });
    segs.push({ text: key, fg: 'accent' });
    if (label) {
      segs.push({ text: ` ${label}`, fg: 'textMuted', dim: true });
    }
  });
  return segs;
}

/** 权限确认：替换 Composer 的独立选择面板（Grok 风格，亦可复用于 plan 提问） */
function buildApprovalPanel(input: LayoutInput): {
  lines: StyledLine[];
  optionRows: Array<{ index: number; rowOffset: number }>;
} {
  if (!input.permission) return { lines: [], optionRows: [] };
  const choices = approvalChoices();
  const { title, body } = padChoiceTitle(
    input.permission.toolName,
    input.permission.reason,
  );
  const cmd =
    typeof input.permission.toolInput?.command === 'string'
      ? input.permission.toolInput.command
      : undefined;
  const detail = [body, cmd ? `$ ${cmd}` : ''].filter(Boolean).join('\n');
  const lines = buildChoicePanel({
    width: input.width,
    title,
    body: detail || undefined,
    options: choices,
    selectedIndex: input.overlayIndex ?? 0,
    footerLeft: '↑/↓ navigate',
    footerRight: 'Enter: select',
  });
  const optionRows: Array<{ index: number; rowOffset: number }> = [];
  lines.forEach((line, i) => {
    const plain = line.map((s) => s.text).join('');
    if (plain.includes('(●)') || plain.includes('(○)')) {
      optionRows.push({ index: optionRows.length, rowOffset: i });
    }
  });
  return { lines, optionRows };
}

export function buildFrame(input: LayoutInput): LayoutResult {
  const { width, height } = input;
  const hits: HitTarget[] = [];

  const dock = buildDockRow(input);
  const shortcuts = buildShortcuts(input);
  const approval = buildApprovalPanel(input);
  const showApproval = approval.lines.length > 0;
  // 先估 chrome 再决定 composer 最大行数，避免循环依赖：用上限 8
  const maxComposerBody = Math.max(
    1,
    Math.min(8, Math.floor(Math.max(8, height) / 4)),
  );
  const composer = showApproval
    ? { lines: [] as StyledLine[], inputRowOffset: 0, bodyRowCount: 0 }
    : buildComposerBox({
        width,
        input: input.input,
        mode: input.mode,
        modelLabel: input.modelLabel,
        focusScrollback: input.focus === 'scrollback',
        autocomplete: input.autocomplete,
        pasteBlocks: input.pasteBlocks,
        maxBodyRows: maxComposerBody,
      });

  // viewport + dockGap(1) + dock(1) + (approval | composer) + shortcuts(1)
  const dockGapRows = 1;
  const dockRows = dockGapRows + 1;
  const bottomPanel = showApproval ? approval.lines : composer.lines;
  const chrome = dockRows + bottomPanel.length + 1;
  const viewportRows = Math.max(1, height - chrome);

  const showWelcome = input.welcome && input.messages.length === 0;
  let body: StyledLine[] = [];
  let toggles: Array<{ line: number; id: string }> = [];
  let stickyUserRange: { start: number; end: number } | null = null;

  if (showWelcome) {
    body = buildWelcomePanel({
      width,
      workspaceLabel: input.workspaceLabel,
    });
  } else {
    const rendered = messagesToLines(input.messages, width, {
      streaming: input.streaming,
      expandedIds: input.expandedIds,
      hoveredId: input.hoveredId,
      animTick: input.animTick,
      nowMs: input.nowMs,
    });
    body = rendered.lines;
    toggles = rendered.toggles;
    stickyUserRange = rendered.stickyUserRange;
  }

  // 末轮用户气泡吸顶：视口已滚过该气泡时钉在顶部
  const maxOffset = Math.max(0, body.length - viewportRows);
  const offset = Math.min(Math.max(0, input.scrollOffset), maxOffset);
  const start0 = Math.max(0, body.length - viewportRows - offset);

  let sticky: StyledLine[] = [];
  let contentStart = start0;
  let contentLen = viewportRows;
  const pinSticky =
    !showWelcome &&
    stickyUserRange != null &&
    start0 > stickyUserRange.start;

  if (pinSticky && stickyUserRange) {
    sticky = body.slice(stickyUserRange.start, stickyUserRange.end);
    contentLen = Math.max(1, viewportRows - sticky.length);
    contentStart = Math.max(
      stickyUserRange.end,
      body.length - contentLen - offset,
    );
  }

  const content = body.slice(contentStart, contentStart + contentLen);
  const visible = [...sticky, ...content];
  const topAlign = showWelcome || body.length <= viewportRows;
  while (visible.length < viewportRows) {
    if (topAlign) visible.push([{ text: '' }]);
    else visible.unshift([{ text: '' }]);
  }

  // 对话区与 dock 之间留 1 空行，避免贴死
  const dockGap: StyledLine = [{ text: '' }];
  const lines: StyledLine[] = [...visible, dockGap, dock, ...bottomPanel, shortcuts];

  const composerRow = showApproval
    ? -1
    : visible.length + dockRows + composer.inputRowOffset;
  if (!showApproval) {
    hits.push({ kind: 'composer', row: composerRow, col: 0 });
  }
  for (let r = 0; r < visible.length; r++) {
    hits.push({ kind: 'scrollback', row: r, col: 0 });
  }

  const stickyOffset = sticky.length;
  for (const t of toggles) {
    if (pinSticky && stickyUserRange) {
      if (t.line >= stickyUserRange.start && t.line < stickyUserRange.end) {
        hits.push({
          kind: 'timeline-toggle',
          id: t.id,
          row: t.line - stickyUserRange.start,
          col: 0,
        });
        continue;
      }
    }
    const rowInContent = t.line - contentStart;
    if (rowInContent >= 0 && rowInContent < content.length) {
      hits.push({
        kind: 'timeline-toggle',
        id: t.id,
        row: stickyOffset + rowInContent,
        col: 0,
      });
    }
  }
  if (showApproval) {
    const base = visible.length + dockRows;
    for (const opt of approval.optionRows) {
      hits.push({
        kind: opt.index === 0 ? 'approval-yes' : 'approval-no',
        row: base + opt.rowOffset,
        col: 2,
      });
    }
  }

  while (lines.length < height) lines.push([{ text: '' }]);
  const composerBoxTopRow = showApproval ? -1 : visible.length + dockRows;
  return {
    lines: lines.slice(0, height),
    hits,
    composerRow,
    composerBoxTopRow,
    composerBodyRowCount: showApproval ? 0 : composer.bodyRowCount,
    composerWidth: width,
  };
}
