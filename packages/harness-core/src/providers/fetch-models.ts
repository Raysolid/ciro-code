import type { ProviderModelEntry, ProviderPreset } from '@ciro/harness-shared';
import { validateProviderBaseUrl } from './validate-provider-url.js';

export interface RemoteModelInfo {
  id: string;
  label?: string;
  /** 官方 API 上下文上限；无则不写 */
  apiMaxContext?: number;
}

/**
 * 拉取 OpenAI 兼容 /models 列表。
 * fullUrl=true 时 baseUrl 即完整端点；否则拼接 /models。
 */
export async function fetchRemoteModelList(
  provider: Pick<ProviderPreset, 'baseUrl' | 'fullUrl' | 'auth'>,
  apiKey: string | undefined,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; models: RemoteModelInfo[] } | { ok: false; error: string; status?: number }> {
  const urlCheck = validateProviderBaseUrl(provider.baseUrl);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };
  if (!apiKey) return { ok: false, error: 'API Key is required to fetch models' };

  const base = urlCheck.url.replace(/\/$/, '');
  const endpoint = provider.fullUrl ? base : `${base}/models`;
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (provider.auth.type === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 200) || `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as unknown;
    return { ok: true, models: parseOpenAiModelsPayload(json) };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Timed out after ${timeoutMs}ms`
          : err.message
        : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** 只认常见官方字段；无则 undefined */
export function parseApiMaxContext(item: Record<string, unknown>): number | undefined {
  for (const key of ['context_length', 'context_window', 'max_model_len'] as const) {
    const v = item[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  }
  return undefined;
}

export function parseOpenAiModelsPayload(json: unknown): RemoteModelInfo[] {
  if (!json || typeof json !== 'object') return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: RemoteModelInfo[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = rec.id;
    if (typeof id !== 'string' || !id.trim()) continue;
    const apiMaxContext = parseApiMaxContext(rec);
    out.push({
      id: id.trim(),
      label: id.trim(),
      ...(apiMaxContext !== undefined ? { apiMaxContext } : {}),
    });
  }
  return out;
}

/** 合并远程列表到本地：已有保留 enabled/label/用户字段；apiMaxContext 以远程为准（有则写、无则清） */
export function mergeFetchedModels(
  local: ProviderModelEntry[],
  remote: RemoteModelInfo[],
): { models: ProviderModelEntry[]; added: number } {
  const byId = new Map(local.map((m) => [m.id, { ...m }]));
  let added = 0;
  for (const r of remote) {
    const existing = byId.get(r.id);
    if (existing) {
      const next: ProviderModelEntry = {
        ...existing,
        label: existing.label && existing.label !== existing.id ? existing.label : r.label || r.id,
      };
      if (r.apiMaxContext !== undefined) next.apiMaxContext = r.apiMaxContext;
      else delete next.apiMaxContext;
      byId.set(r.id, next);
    } else {
      byId.set(r.id, {
        id: r.id,
        label: r.label || r.id,
        enabled: false,
        ...(r.apiMaxContext !== undefined ? { apiMaxContext: r.apiMaxContext } : {}),
      });
      added += 1;
    }
  }
  return { models: [...byId.values()], added };
}
