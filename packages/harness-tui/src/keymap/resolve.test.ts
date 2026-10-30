import { describe, expect, it } from 'vitest';
import type { KeyEvent } from '../input/types.js';
import { resolveCommand } from './resolve.js';

function ke(partial: Partial<KeyEvent> & Pick<KeyEvent, 'name'>): KeyEvent {
  return { raw: '', ...partial };
}

describe('resolveCommand', () => {
  it('prefers overlay over composer', () => {
    expect(resolveCommand(['Composer', 'Overlay'], ke({ name: 'char', char: 'y' }))).toBe(
      'confirm:yes',
    );
  });

  it('overlay arrows and enter navigate/confirm', () => {
    expect(resolveCommand(['Overlay'], ke({ name: 'up' }))).toBe('overlay:prev');
    expect(resolveCommand(['Overlay'], ke({ name: 'down' }))).toBe('overlay:next');
    expect(resolveCommand(['Overlay'], ke({ name: 'enter' }))).toBe('overlay:confirm');
    expect(resolveCommand(['Overlay'], ke({ name: 'escape' }))).toBe('confirm:no');
  });

  it('falls back to global', () => {
    expect(resolveCommand(['Composer'], ke({ name: 'ctrl+l', ctrl: true }))).toBe('app:redraw');
  });

  it('maps enter in composer to submit', () => {
    expect(resolveCommand(['Composer'], ke({ name: 'enter' }))).toBe('chat:submit');
  });

  it('maps tab in scrollback back to composer', () => {
    expect(resolveCommand(['Scrollback'], ke({ name: 'tab' }))).toBe('focus:composer');
  });
});
