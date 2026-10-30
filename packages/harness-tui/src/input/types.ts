export type KeyName =
  | 'enter'
  | 'shift+enter'
  | 'escape'
  | 'backspace'
  | 'tab'
  | 'shift+tab'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'pageup'
  | 'pagedown'
  | 'home'
  | 'end'
  | 'ctrl+c'
  | 'ctrl+d'
  | 'ctrl+j'
  | 'ctrl+l'
  | 'ctrl+u'
  | 'char'
  | 'paste'
  | 'unknown';

export interface KeyEvent {
  name: KeyName;
  char?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  raw: string;
}

export type MouseKind = 'click' | 'wheel' | 'move' | 'release';

export interface MouseEvent {
  kind: MouseKind;
  x: number; // 1-based
  y: number;
  button: number;
  raw: string;
}

export type InputEvent =
  | { type: 'key'; event: KeyEvent }
  | { type: 'mouse'; event: MouseEvent };
