/**
 * Phase 3 Provider baseUrl 校验（同步静态）。
 * 完整 DNS SSRF 见 `net/validate-outbound-url`（MCP / 出站共用）。
 */
import { validateOutboundUrlSync } from '../net/validate-outbound-url.js';

export function validateProviderBaseUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const r = validateOutboundUrlSync(raw, { stripTrailingSlash: true });
  if (!r.ok) {
    return {
      ok: false,
      error: r.error.replace(/^URL/, 'baseUrl'),
    };
  }
  return r;
}
