import { stringWidth, truncateToWidth, wrapToWidth } from '../width/measure.js';
import type { ColorSlot, StyledLine, StyledSegment } from '../tui-kit/types.js';
import { boxBottom, boxRow, boxTop } from './box.js';

/** 可复用选择面板（权限确认 / 后续 Plan 提问） */
export interface ChoiceOption {
  id: string;
  label: string;
  /** 快捷键提示，如 y / n */
  hotkey?: string;
}

export interface ChoicePanelInput {
  width: number;
  title: string;
  /** 说明正文（自动换行） */
  body?: string;
  options: ChoiceOption[];
  selectedIndex: number;
  footerLeft?: string;
  footerRight?: string;
}

function fillBg(segs: StyledSegment[], width: number, bg: ColorSlot): StyledLine {
  const used = stringWidth(segs.map((s) => s.text).join(''));
  const out = segs.map((s) => ({ ...s, bg: s.bg ?? bg }));
  if (used < width) out.push({ text: ' '.repeat(width - used), bg });
  return out;
}

/**
 * Grok 风格独立选择面板：圆角边框 + 单选列表 + 底栏导航提示。
 * 供权限确认与后期 plan 提问卡片共用。
 */
export function buildChoicePanel(input: ChoicePanelInput): StyledLine[] {
  const w = Math.max(20, input.width);
  const borderFg: ColorSlot = 'border';
  const lines: StyledLine[] = [];
  const innerW = Math.max(1, w - 4);

  lines.push(boxTop(w, { fg: borderFg, corner: 'round' }));

  lines.push(
    boxRow(
      w,
      [{ text: truncateToWidth(input.title, innerW), fg: 'warning', bold: true }],
      { fg: borderFg },
    ),
  );

  if (input.body?.trim()) {
    for (const row of wrapToWidth(input.body.trim(), innerW).slice(0, 6)) {
      lines.push(
        boxRow(w, [{ text: row, fg: 'textMuted' }], { fg: borderFg }),
      );
    }
  }

  lines.push(boxRow(w, [{ text: '' }], { fg: borderFg }));

  const opts = input.options;
  const sel = Math.max(0, Math.min(opts.length - 1, input.selectedIndex));
  opts.forEach((opt, i) => {
    const focused = i === sel;
    const mark = focused ? '(●)' : '(○)';
    const num = `${i + 1}`;
    const hot = opt.hotkey ? ` ${opt.hotkey}` : '';
    const label = truncateToWidth(`${num} ${mark} ${opt.label}${hot}`, innerW);
    if (focused) {
      const pad = Math.max(0, innerW - stringWidth(label));
      lines.push([
        { text: '│ ', fg: borderFg },
        ...fillBg(
          [{ text: label, fg: 'text', bold: true }, { text: ' '.repeat(pad) }],
          innerW,
          'userBg',
        ),
        { text: ' │', fg: borderFg },
      ]);
    } else {
      lines.push(boxRow(w, [{ text: label, fg: 'textMuted' }], { fg: borderFg }));
    }
  });

  lines.push(boxRow(w, [{ text: '' }], { fg: borderFg }));

  const left = input.footerLeft ?? '↑/↓ navigate';
  const right = input.footerRight ?? 'Enter: select';
  const gap = Math.max(1, innerW - stringWidth(left) - stringWidth(right));
  lines.push(
    boxRow(
      w,
      [
        { text: left, fg: 'textMuted', dim: true },
        { text: ' '.repeat(gap) },
        { text: right, fg: 'accent', bold: true },
      ],
      { fg: borderFg },
    ),
  );

  lines.push(boxBottom(w, { fg: borderFg, corner: 'round' }));
  return lines;
}

/** 权限确认默认选项 */
export function approvalChoices(): ChoiceOption[] {
  return [
    { id: 'allow', label: 'Allow', hotkey: 'y' },
    { id: 'deny', label: 'Deny', hotkey: 'n' },
  ];
}

export function clampChoiceIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function padChoiceTitle(toolName: string, reason?: string): { title: string; body?: string } {
  const title = `Approval: ${toolName}`;
  const body = reason?.trim() || undefined;
  return { title, body };
}
