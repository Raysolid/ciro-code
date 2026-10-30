/**
 * 保留对话尾部 keepChars 字符，并尽量对齐到 User:/Assistant: 消息边界。
 * 找不到边界时退回裸 slice（单路径，无第二策略栈）。
 */
export function sliceRecentConversation(text: string, keepChars: number): string {
  if (keepChars <= 0) return '';
  if (text.length <= keepChars) return text;

  const start = text.length - keepChars;
  const slice = text.slice(start);
  if (/^(User:|Assistant:)/.test(slice)) return slice;

  const markers = ['\nUser:', '\nAssistant:'] as const;
  let best = -1;
  for (const m of markers) {
    const i = slice.indexOf(m);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  if (best >= 0) return slice.slice(best + 1);
  return slice;
}
