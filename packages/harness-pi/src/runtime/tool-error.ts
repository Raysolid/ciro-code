/** Pi tool_execution_end：框架 throw → isError；自定义工具 return details.error → 亦视为失败 */
export function toolResultIsError(event: { isError?: boolean; result?: unknown }): boolean {
  if (event.isError) return true;
  if (!event.result || typeof event.result !== 'object') return false;
  const details = (event.result as { details?: { error?: boolean } }).details;
  return details?.error === true;
}

function textsFromToolContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const text = content
    .map((c) =>
      c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string'
        ? (c as { text: string }).text
        : '',
    )
    .filter(Boolean)
    .join('\n');
  return text || null;
}

/** 取工具返回的纯文本，避免把 {content, details} JSON 当 preview */
export function previewFromToolResult(result: unknown): string {
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"content"')) {
      try {
        const parsed = JSON.parse(trimmed) as { content?: unknown };
        const text = textsFromToolContent(parsed.content);
        if (text) return text;
      } catch {
        // 截断 JSON 交给 UI formatShellPreview
      }
    }
    return result;
  }
  if (result && typeof result === 'object') {
    const text = textsFromToolContent((result as { content?: unknown }).content);
    if (text) return text;
  }
  try {
    return JSON.stringify(result) ?? '';
  } catch {
    return '';
  }
}

export function clipToolPreview(preview: string, toolName?: string): string {
  return preview.slice(0, toolName === 'AskQuestion' ? 4000 : 300);
}
