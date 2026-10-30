import type { ColorSlot } from '../tui-kit/types.js';

/** dark 一档语义 hex（冷色 accent；mode 同系可辨）。T-1.5 不交付 light。 */
export const DARK_HEX: Record<ColorSlot, string> = {
  text: '#e6e6e6',
  textMuted: '#8a8a8a',
  accent: '#4ecdc4',
  success: '#6bcb77',
  warning: '#e8c547',
  danger: '#e85d5d',
  border: '#4a4a4a',
  /** Thought 标题/正文：略提亮，避免暗底上看不清 */
  thinking: '#8f8f8f',
  toolRun: '#6aa9e8',
  code: '#7ec8e3',
  codeBg: '#1e1e1e',
  link: '#6cb6ff',
  diffAdd: '#6bcb77',
  diffDel: '#e85d5d',
  // Align with harness-ui ModeMenu (dark): ask=success, plan=--mode-plan, agent=muted, debug=danger
  modeAsk: '#4ade80',
  modePlan: '#e8a045',
  modeAgent: '#a1a1aa',
  modeDebug: '#f87171',
  /** Grok prompt band：略亮于底色 */
  userBg: '#2a2a2a',
};

/** 与现有 16 色心智一致的 SGR 前景码（30–37 / 90–97） */
export const FG16: Record<ColorSlot, number> = {
  text: 37,
  textMuted: 90,
  accent: 36,
  success: 32,
  warning: 33,
  danger: 31,
  border: 90,
  thinking: 35,
  toolRun: 34,
  code: 96,
  codeBg: 90,
  link: 94,
  diffAdd: 32,
  diffDel: 31,
  modeAsk: 32, // green (success)
  modePlan: 33, // yellow/orange
  modeAgent: 37, // light gray
  modeDebug: 31, // red (danger)
  userBg: 90,
};

/** 16 色背景（40–47 / 100–107） */
export const BG16: Record<ColorSlot, number> = {
  text: 47,
  textMuted: 100,
  accent: 46,
  success: 42,
  warning: 43,
  danger: 41,
  border: 100,
  thinking: 45,
  toolRun: 44,
  code: 44,
  codeBg: 40,
  link: 44,
  diffAdd: 42,
  diffDel: 41,
  modeAsk: 42,
  modePlan: 43,
  modeAgent: 47,
  modeDebug: 41,
  userBg: 100, // bright-black band
};

/** 256 色近似（xterm 立方 + 灰度） */
export const FG256: Record<ColorSlot, number> = {
  text: 252,
  textMuted: 244,
  accent: 80,
  success: 114,
  warning: 221,
  danger: 167,
  border: 240,
  thinking: 183,
  toolRun: 75,
  code: 117,
  codeBg: 236,
  link: 75,
  diffAdd: 114,
  diffDel: 167,
  modeAsk: 114, // ~#4ade80
  modePlan: 215, // ~#e8a045
  modeAgent: 248, // ~#a1a1aa
  modeDebug: 210, // ~#f87171
  userBg: 235,
};

/** 256 色背景 */
export const BG256: Record<ColorSlot, number> = {
  ...FG256,
  userBg: 235,
  codeBg: 236,
};
