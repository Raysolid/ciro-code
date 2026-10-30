import { describe, expect, it } from 'vitest';
import { consumeInput } from './parse-key.js';

describe('consumeInput', () => {
  it('parses printable chars', () => {
    const { events } = consumeInput('ab');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'key', event: { name: 'char', char: 'a' } });
  });

  it('parses enter and ctrl+c', () => {
    expect(consumeInput('\r').events[0]).toMatchObject({
      type: 'key',
      event: { name: 'enter' },
    });
    expect(consumeInput('\x03').events[0]).toMatchObject({
      type: 'key',
      event: { name: 'ctrl+c' },
    });
  });

  it('parses SGR mouse click', () => {
    const { events } = consumeInput('\x1b[<0;10;5M');
    expect(events[0]).toMatchObject({
      type: 'mouse',
      event: { kind: 'click', x: 10, y: 5, button: 0 },
    });
  });

  it('parses wheel up', () => {
    const { events } = consumeInput('\x1b[<64;1;1M');
    expect(events[0]).toMatchObject({
      type: 'mouse',
      event: { kind: 'wheel', button: 64 },
    });
  });

  it('maps LF / Ctrl+J to newline key, CR to enter', () => {
    expect(consumeInput('\n').events[0]).toMatchObject({
      type: 'key',
      event: { name: 'ctrl+j' },
    });
    expect(consumeInput('\r').events[0]).toMatchObject({
      type: 'key',
      event: { name: 'enter' },
    });
  });

  it('parses Shift+Enter CSI', () => {
    expect(consumeInput('\x1b[13;2~').events[0]).toMatchObject({
      type: 'key',
      event: { name: 'shift+enter' },
    });
  });
});
