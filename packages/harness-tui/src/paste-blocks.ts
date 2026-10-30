/** 输入串内粘贴块标记（用户不可见控制符包裹） */
export const PASTE_MARK_RE = /\x1FPASTE:(\d+)\x1F/g;

export function makePasteMark(id: number): string {
  return `\x1FPASTE:${id}\x1F`;
}

export function normalizePasteText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 归一化换行后统计行数 */
export function countPasteLines(text: string): number {
  const n = normalizePasteText(text);
  if (!n) return 0;
  return n.split('\n').length;
}

/** ≥2 行视为「多行粘贴」，应收成 chip */
export function isMultilinePaste(text: string): boolean {
  return countPasteLines(text) >= 2;
}

export type InputPiece =
  | { kind: 'text'; text: string }
  | { kind: 'paste'; id: number };

/** 拆成普通文本段 + 粘贴标记 */
export function splitInputPieces(input: string): InputPiece[] {
  const out: InputPiece[] = [];
  const re = new RegExp(PASTE_MARK_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      out.push({ kind: 'text', text: input.slice(last, m.index) });
    }
    out.push({ kind: 'paste', id: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ kind: 'text', text: input.slice(last) });
  if (!out.length) out.push({ kind: 'text', text: '' });
  return out;
}

/** 发送前：把标记展开为真实粘贴正文 */
export function expandPasteMarks(
  input: string,
  blocks: ReadonlyMap<number, string>,
): string {
  return input.replace(PASTE_MARK_RE, (_all, idStr: string) => {
    const body = blocks.get(Number(idStr));
    return body ?? '';
  });
}

/** 退格：若末尾是粘贴标记则整块删除 */
export function backspaceInput(input: string): string {
  const re = /\x1FPASTE:\d+\x1F$/;
  if (re.test(input)) return input.replace(re, '');
  const chars = [...input];
  chars.pop();
  return chars.join('');
}

export function pasteChipLabel(lineCount: number): string {
  return `[Pasted ${lineCount} lines]`;
}
