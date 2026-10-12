import type { ProviderPreset, ProviderTestResult } from '@ciro-code/harness-shared';
import { validateProviderBaseUrl } from './validate-provider-url.js';

/**
 * 连通性探测：对 OpenAI 兼容网关 GET {baseUrl}/models（Bearer）。
 * 不拉取完整列表合并（那是 M2 fetch-models）。
 */
export async function testProviderConnectivity(
  provider: Pick<ProviderPreset, 'baseUrl' | 'fullUrl' | 'auth'>,
  apiKey: string | undefined,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<ProviderTestResult> {
  const urlCheck = validateProviderBaseUrl(provider.baseUrl);
  if (!urlCheck.ok) {
    return { ok: false, message: urlCheck.error };
  }
  if (!apiKey) {
    return { ok: false, message: 'API Key is required for connectivity test' };
  }

  const base = urlCheck.url.replace(/\/$/, '');
  const endpoint = provider.fullUrl ? base : `${base}/models`;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const started = Date.now();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
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
    const latencyMs = Date.now() - started;
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: 'Connected',
        latencyMs,
      };
    }
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      message: text.slice(0, 200) || `HTTP ${res.status}`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Timed out after ${timeoutMs}ms`
          : err.message
        : String(err);
    return { ok: false, message, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
