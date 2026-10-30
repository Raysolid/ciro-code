import type { KeyEvent } from '../input/types.js';
import { DEFAULT_BINDINGS, type CommandId, type KeyContext } from './bindings.js';

function eventKey(ev: KeyEvent): string | null {
  if (ev.name === 'char' && ev.char) {
    if (ev.alt && ev.char.toLowerCase() === 'm') return 'shift+tab'; // win 降级：Alt+M → cycleMode
    return ev.char;
  }
  return ev.name === 'unknown' ? null : ev.name;
}

/**
 * 上下文栈顶优先：Autocomplete > Overlay > Composer/Scrollback > Global
 */
export function resolveCommand(
  stack: KeyContext[],
  ev: KeyEvent,
  bindings = DEFAULT_BINDINGS,
): CommandId | null {
  const key = eventKey(ev);
  if (!key) return null;
  const order = [...stack].reverse();
  // Global always consulted last
  if (!order.includes('Global')) order.push('Global');

  for (const ctx of order) {
    const block = bindings.find((b) => b.context === ctx);
    const cmd = block?.bindings[key];
    if (cmd) return cmd;
  }
  return null;
}
