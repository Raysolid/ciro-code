export type ColorSlot =
  | 'text'
  | 'textMuted'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'border'
  | 'thinking'
  | 'toolRun'
  | 'code'
  | 'codeBg'
  | 'link'
  | 'diffAdd'
  | 'diffDel'
  | 'modeAsk'
  | 'modePlan'
  | 'modeAgent'
  | 'modeDebug'
  /** Grok prompt 浅底条带 */
  | 'userBg';

export interface StyledSegment {
  text: string;
  fg?: ColorSlot;
  bg?: ColorSlot;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
  underline?: boolean;
}

export type StyledLine = StyledSegment[];

export type HitKind =
  | 'composer'
  | 'scrollback'
  | 'approval-yes'
  | 'approval-no'
  | 'timeline-toggle'
  | 'none';

export interface HitTarget {
  kind: HitKind;
  id?: string;
  row: number;
  col: number;
}

export interface TuiComponent {
  render(width: number): StyledLine[];
  handleInput?(key: import('../input/types.js').KeyEvent): boolean;
  hitTest?(x: number, y: number, rowOffset: number): HitTarget | null;
}
