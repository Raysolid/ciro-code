export type KeyContext = 'Global' | 'Composer' | 'Scrollback' | 'Overlay' | 'Autocomplete';

export type CommandId =
  | 'app:interrupt'
  | 'app:exit'
  | 'app:redraw'
  | 'chat:submit'
  | 'chat:newline'
  | 'chat:cycleMode'
  | 'chat:cancelOrDismiss'
  | 'scroll:pageUp'
  | 'scroll:pageDown'
  | 'scroll:follow'
  | 'scroll:top'
  | 'focus:scrollback'
  | 'focus:composer'
  | 'slash:open'
  | 'mention:open'
  | 'confirm:yes'
  | 'confirm:no'
  | 'overlay:dismiss'
  | 'overlay:prev'
  | 'overlay:next'
  | 'overlay:confirm'
  | 'history:prev'
  | 'history:next'
  | 'selection:copy';

export interface KeybindingBlock {
  context: KeyContext;
  bindings: Record<string, CommandId>;
}

export const DEFAULT_BINDINGS: KeybindingBlock[] = [
  {
    context: 'Global',
    bindings: {
      'ctrl+c': 'app:interrupt',
      'ctrl+d': 'app:exit',
      'ctrl+l': 'app:redraw',
      pageup: 'scroll:pageUp',
      pagedown: 'scroll:pageDown',
      end: 'scroll:follow',
      home: 'scroll:top',
    },
  },
  {
    context: 'Composer',
    bindings: {
      enter: 'chat:submit',
      escape: 'chat:cancelOrDismiss',
      tab: 'focus:scrollback',
      'shift+tab': 'chat:cycleMode',
      // 换行：Ctrl+J（LF）/ Shift+Enter（Ctrl+M 与 Enter 同码，不绑定）
      'ctrl+j': 'chat:newline',
      'shift+enter': 'chat:newline',
      up: 'history:prev',
      down: 'history:next',
      '/': 'slash:open',
      '@': 'mention:open',
    },
  },
  {
    context: 'Scrollback',
    bindings: {
      g: 'scroll:top',
      G: 'scroll:follow',
      // Tab 来回切换；否则切走后无绑定，按键被静默丢弃像「卡住」
      tab: 'focus:composer',
      escape: 'focus:composer',
      enter: 'focus:composer',
      y: 'selection:copy',
    },
  },
  {
    context: 'Overlay',
    bindings: {
      y: 'confirm:yes',
      n: 'confirm:no',
      up: 'overlay:prev',
      down: 'overlay:next',
      left: 'overlay:prev',
      right: 'overlay:next',
      enter: 'overlay:confirm',
      escape: 'confirm:no',
    },
  },
  {
    context: 'Autocomplete',
    bindings: {
      escape: 'overlay:dismiss',
      tab: 'confirm:yes',
      enter: 'confirm:yes',
    },
  },
];
