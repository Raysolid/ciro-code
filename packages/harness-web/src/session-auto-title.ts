import type { ProviderStore, SessionStore } from '@ciro/harness-core';

/** 从 events 提取首条用户与助手文本 */
export function extractTitleSource(
  store: SessionStore,
  sessionId: string,
): { user: string; assistant: string } {
  const events = store.eventLog?.readEvents(sessionId) ?? [];
  let user = '';
  let assistant = '';
  for (const e of events) {
    if (e.type === 'message' && e.role === 'user' && !user) {
      user = String(e.content ?? '').trim();
    } else if (e.type === 'message' && e.role === 'assistant' && !assistant) {
      assistant = String(e.content ?? '').trim();
    }
    if (user && assistant) break;
  }
  return { user, assistant };
}

export function heuristicTitle(user: string, maxLen = 36): string {
  const oneLine = user.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '新会话';
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function sanitizeGeneratedTitle(raw: string, fallback: string): string {
  let t = raw
    .replace(/^["'「『]|["'」』]$/g, '')
    .replace(/^标题[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 48) return fallback;
  return t;
}

/**
 * 尝试用当前 Provider 的 chat/completions 生成短标题；失败则启发式。
 */
export async function generateSessionTitle(opts: {
  store: SessionStore;
  providerStore: ProviderStore;
  sessionId: string;
  agentBackend?: string;
}): Promise<string> {
  const { user, assistant } = extractTitleSource(opts.store, opts.sessionId);
  const fallback = heuristicTitle(user);

  if (opts.agentBackend === 'mock' || !user) {
    return fallback;
  }

  const modelRef = opts.providerStore.resolveEffectiveModelRef(null);
  if (!modelRef) return fallback;
  const creds = opts.providerStore.resolveCredentials(modelRef);
  if (!creds) return fallback;

  const base = creds.provider.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const assistantSnippet = assistant.slice(0, 400);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: creds.model.id,
        temperature: 0.3,
        max_tokens: 32,
        messages: [
          {
            role: 'system',
            content:
              '为对话生成一个简短中文标题，不超过16个汉字或8个英文词。只输出标题本身，不要引号或解释。',
          },
          {
            role: 'user',
            content: `用户：${user.slice(0, 300)}\n助手：${assistantSnippet || '（暂无）'}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    return sanitizeGeneratedTitle(content, fallback);
  } catch {
    return fallback;
  }
}
