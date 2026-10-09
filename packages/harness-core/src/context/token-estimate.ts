/** Phase 2 默认估算：chars/4；非计费真相 */
export function roughTokenEstimate(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
