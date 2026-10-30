import type { InputEvent, KeyEvent, MouseEvent } from './types.js';

const ESC = '\x1b';

function key(partial: Omit<KeyEvent, 'raw'> & { raw?: string }, raw: string): KeyEvent {
  return { ...partial, raw };
}

/** 解析 SGR 鼠标：ESC[<b;x;yM 或 m */
function tryParseMouse(buf: string): { event: MouseEvent; rest: string } | null {
  if (!buf.startsWith(`${ESC}[<`)) return null;
  const m = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buf);
  if (!m) return null;
  const button = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  const release = m[4] === 'm';
  let kind: MouseEvent['kind'] = release ? 'release' : 'click';
  // 64/65 = wheel
  if (button === 64 || button === 65) kind = 'wheel';
  else if (button >= 32) kind = 'move';
  return {
    event: { kind, x, y, button, raw: m[0] },
    rest: buf.slice(m[0].length),
  };
}

function parseEscSeq(buf: string): { event: KeyEvent; rest: string } | null {
  if (buf === `${ESC}`) {
    return { event: key({ name: 'escape' }, buf), rest: '' };
  }
  // CSI
  if (buf.startsWith(`${ESC}[`)) {
    if (buf === `${ESC}[A` || buf.startsWith(`${ESC}[A`))
      return { event: key({ name: 'up' }, `${ESC}[A`), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[B`))
      return { event: key({ name: 'down' }, `${ESC}[B`), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[C`))
      return { event: key({ name: 'right' }, `${ESC}[C`), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[D`))
      return { event: key({ name: 'left' }, `${ESC}[D`), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[5~`))
      return { event: key({ name: 'pageup' }, `${ESC}[5~`), rest: buf.slice(4) };
    if (buf.startsWith(`${ESC}[6~`))
      return { event: key({ name: 'pagedown' }, `${ESC}[6~`), rest: buf.slice(4) };
    if (buf.startsWith(`${ESC}[H`) || buf.startsWith(`${ESC}[1~`))
      return { event: key({ name: 'home' }, buf.slice(0, 3)), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[F`) || buf.startsWith(`${ESC}[4~`))
      return { event: key({ name: 'end' }, buf.slice(0, 3)), rest: buf.slice(3) };
    if (buf.startsWith(`${ESC}[Z`))
      return { event: key({ name: 'shift+tab', shift: true }, `${ESC}[Z`), rest: buf.slice(3) };
    // Shift+Enter：xterm modifyOtherKeys / fixterms
    if (buf.startsWith(`${ESC}[13;2~`))
      return { event: key({ name: 'shift+enter', shift: true }, `${ESC}[13;2~`), rest: buf.slice(7) };
    if (buf.startsWith(`${ESC}[27;2;13~`))
      return {
        event: key({ name: 'shift+enter', shift: true }, `${ESC}[27;2;13~`),
        rest: buf.slice(9),
      };
  }
  // Alt+letter
  if (buf.length >= 2 && buf[0] === ESC && buf[1] && buf[1] !== '[') {
    return {
      event: key({ name: 'char', char: buf[1], alt: true }, buf.slice(0, 2)),
      rest: buf.slice(2),
    };
  }
  return null;
}

/**
 * 从 stdin 缓冲拆出按键/鼠标事件。不完整转义序列留在 rest。
 */
export function consumeInput(buffer: string): { events: InputEvent[]; rest: string } {
  const events: InputEvent[] = [];
  let buf = buffer;

  while (buf.length > 0) {
    // 括号粘贴
    if (buf.startsWith(`${ESC}[200~`)) {
      const end = buf.indexOf(`${ESC}[201~`);
      if (end < 0) break;
      const body = buf.slice(6, end);
      events.push({
        type: 'key',
        event: key({ name: 'paste', char: body }, buf.slice(0, end + 6)),
      });
      buf = buf.slice(end + 6);
      continue;
    }

    const mouse = tryParseMouse(buf);
    if (mouse) {
      events.push({ type: 'mouse', event: mouse.event });
      buf = mouse.rest;
      continue;
    }

    if (buf[0] === ESC) {
      // 等完整序列：若只有 ESC 且可能后续，交给调用方延迟；此处单 ESC → escape
      if (buf.length === 1) {
        events.push({ type: 'key', event: key({ name: 'escape' }, ESC) });
        buf = '';
        break;
      }
      const esc = parseEscSeq(buf);
      if (esc) {
        events.push({ type: 'key', event: esc.event });
        buf = esc.rest;
        continue;
      }
      // 未识别 CSI：丢弃 ESC
      buf = buf.slice(1);
      continue;
    }

    const ch = buf[0]!;
    buf = buf.slice(1);
    const code = ch.charCodeAt(0);

    if (ch === '\r') {
      // Enter 提交；Ctrl+M 与 \\r 同码，无法区分
      events.push({ type: 'key', event: key({ name: 'enter' }, ch) });
    } else if (ch === '\n' || code === 10) {
      // Ctrl+J / LF → 换行（与 Enter/CR 区分）
      events.push({ type: 'key', event: key({ name: 'ctrl+j', ctrl: true }, ch) });
    } else if (ch === '\t') {
      events.push({ type: 'key', event: key({ name: 'tab' }, ch) });
    } else if (ch === '\x7f' || ch === '\b') {
      events.push({ type: 'key', event: key({ name: 'backspace' }, ch) });
    } else if (code === 3) {
      events.push({ type: 'key', event: key({ name: 'ctrl+c', ctrl: true }, ch) });
    } else if (code === 4) {
      events.push({ type: 'key', event: key({ name: 'ctrl+d', ctrl: true }, ch) });
    } else if (code === 12) {
      events.push({ type: 'key', event: key({ name: 'ctrl+l', ctrl: true }, ch) });
    } else if (code === 21) {
      events.push({ type: 'key', event: key({ name: 'ctrl+u', ctrl: true }, ch) });
    } else if (code < 32) {
      events.push({ type: 'key', event: key({ name: 'unknown' }, ch) });
    } else {
      events.push({ type: 'key', event: key({ name: 'char', char: ch }, ch) });
    }
  }

  return { events, rest: buf };
}
