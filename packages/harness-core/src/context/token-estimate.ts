/** chars/4；非计费真相 */
export function roughTokenEstimate(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** 侧车 tool result 合计（计入 conversation 桶，不另开桶） */
export function sumToolPayloadTokens(records: Array<{ content: string }>): number {
  let n = 0;
  for (const r of records) n += roughTokenEstimate(r.content);
  return n;
}
