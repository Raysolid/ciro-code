import { stringWidth, truncateMiddleToWidth, truncateToWidth } from '../width/measure.js';
import { truncateStyledLine } from '../tui-kit/styled-line.js';
import type { StyledLine, StyledSegment } from '../tui-kit/types.js';
import { renderCiroWordmark, wordmarkPlainWidth } from './brand-ascii.js';

/** Keep in sync with package.json version. */
const APP_VERSION = '0.1.0';

export interface WelcomePanelInput {
  width: number;
  workspaceLabel?: string | null;
}

function linePlainWidth(line: StyledLine): number {
  return stringWidth(line.map((s) => s.text).join(''));
}

function padLine(line: StyledLine, width: number): StyledLine {
  const w = linePlainWidth(line);
  if (w === width) return line;
  if (w < width) return [...line, { text: ' '.repeat(width - w) }];
  return truncateStyledLine(line, width);
}

function vCenter(lines: StyledLine[], targetRows: number): StyledLine[] {
  if (lines.length >= targetRows) return lines.slice(0, targetRows);
  const pad = targetRows - lines.length;
  const top = Math.floor(pad / 2);
  const bottom = pad - top;
  return [
    ...Array.from({ length: top }, () => [{ text: '' }] as StyledLine),
    ...lines,
    ...Array.from({ length: bottom }, () => [{ text: '' }] as StyledLine),
  ];
}

function joinColumns(
  left: StyledLine[],
  right: StyledLine[],
  leftCol: number,
  rightCol: number,
  gap: number,
): StyledLine[] {
  const rows = Math.max(left.length, right.length);
  const Lblock =
    left.length < rows
      ? [...left, ...Array.from({ length: rows - left.length }, () => [{ text: '' }] as StyledLine)]
      : left;
  const Rblock = vCenter(right, rows);
  const out: StyledLine[] = [];
  for (let i = 0; i < rows; i++) {
    out.push([
      ...padLine(Lblock[i] ?? [{ text: '' }], leftCol),
      { text: ' '.repeat(gap) },
      ...padLine(Rblock[i] ?? [{ text: '' }], rightCol),
    ]);
  }
  return out;
}

function t(text: string, width: number, seg: Omit<StyledSegment, 'text'> = { fg: 'textMuted' }): StyledLine {
  return [{ text: truncateToWidth(text, width), ...seg }];
}

function displayPath(raw: string, maxWidth: number): string {
  let p = raw.replace(/\\/g, '/');
  const home = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
  if (home && (p === home || p.startsWith(home + '/'))) {
    p = '~' + p.slice(home.length);
  }
  return truncateMiddleToWidth(p, maxWidth);
}

function buildRightColumn(colWidth: number, workspaceLabel?: string | null): StyledLine[] {
  const ver = `Ciro Code v${APP_VERSION}`;
  const pathBudget = Math.max(8, colWidth - stringWidth(ver) - 3);
  const meta = workspaceLabel
    ? `${ver} · ${displayPath(workspaceLabel, pathBudget)}`
    : ver;
  return [
    t(meta, colWidth, { fg: 'text' }),
    t('Welcome back!', colWidth, { fg: 'text', bold: true }),
    t('Terminal coding agent for Ask / Plan / Agent / Debug.', colWidth),
    t('Tips for getting started', colWidth, { fg: 'accent', bold: true }),
    t('Enter send · Tab browse · Shift+Tab cycle mode', colWidth),
    t('/ commands · @ files · ? shortcuts', colWidth),
  ];
}

/**
 * Two-column splash: left brandmark · right meta/welcome/tips (no blank rows in tips).
 * Logo / tip color slots unchanged.
 */
export function buildWelcomePanel(input: WelcomePanelInput): StyledLine[] {
  const w = input.width;
  const markW = wordmarkPlainWidth(w);
  const canSplit = w >= 72 && markW + 24 <= w;

  const lines: StyledLine[] = [[{ text: '' }]];

  if (canSplit) {
    const gap = 4;
    const leftCol = Math.min(Math.max(markW, 12), Math.floor(w * 0.5));
    const rightCol = Math.max(16, w - leftCol - gap);
    const left = renderCiroWordmark(leftCol);
    const right = buildRightColumn(rightCol, input.workspaceLabel);
    lines.push(...joinColumns(left, right, leftCol, rightCol, gap));
  } else {
    lines.push(...renderCiroWordmark(w));
    lines.push(...buildRightColumn(w, input.workspaceLabel));
  }

  lines.push([{ text: '' }]);
  return lines;
}
