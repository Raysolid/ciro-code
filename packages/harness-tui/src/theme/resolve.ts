import type { HarnessMode } from '@ciro-code/harness-shared';
import type { TerminalCapabilities } from '../terminal/capabilities.js';
import type { ColorSlot } from '../tui-kit/types.js';
import { BG16, BG256, DARK_HEX, FG16, FG256 } from './tokens.js';

const ESC = '\x1b';

export type ColorTier = 'truecolor' | '256' | '16';

/**
 * 选档：truecolor → 256 → 16。
 * light / CIRO_TUI_THEME → T-4（本里程碑只交付 dark）。
 */
export function resolveColorTier(caps?: Pick<TerminalCapabilities, 'truecolor'> | null): ColorTier {
  if (caps?.truecolor) return 'truecolor';
  // 有 COLORTERM 以外的常见 256 色终端仍走 256；无 caps 时单测友好回落 16
  if (caps == null) return '16';
  return '256';
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 打开前景色 SGR（不含重置）；无 slot 返回空串 */
export function slotToFgOpen(
  slot: ColorSlot | undefined,
  caps?: Pick<TerminalCapabilities, 'truecolor'> | null,
): string {
  if (!slot) return '';
  const tier = resolveColorTier(caps);
  if (tier === 'truecolor') {
    const { r, g, b } = parseHex(DARK_HEX[slot]);
    return `${ESC}[38;2;${r};${g};${b}m`;
  }
  if (tier === '256') {
    return `${ESC}[38;5;${FG256[slot]}m`;
  }
  return `${ESC}[${FG16[slot]}m`;
}

/** 打开背景色 SGR（不含重置） */
export function slotToBgOpen(
  slot: ColorSlot | undefined,
  caps?: Pick<TerminalCapabilities, 'truecolor'> | null,
): string {
  if (!slot) return '';
  const tier = resolveColorTier(caps);
  if (tier === 'truecolor') {
    const { r, g, b } = parseHex(DARK_HEX[slot]);
    return `${ESC}[48;2;${r};${g};${b}m`;
  }
  if (tier === '256') {
    return `${ESC}[48;5;${BG256[slot]}m`;
  }
  return `${ESC}[${BG16[slot]}m`;
}

export function modeToSlot(mode: HarnessMode): ColorSlot {
  switch (mode) {
    case 'ask':
      return 'modeAsk';
    case 'plan':
      return 'modePlan';
    case 'agent':
      return 'modeAgent';
    case 'debug':
      return 'modeDebug';
  }
}
