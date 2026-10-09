/**
 * §6.4 SSRF：HTTP MCP / 出站请求共用。
 * 同步静态校验 + 异步 DNS 解析检查私网 / loopback / link-local / metadata。
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

export type UrlValidation =
  | { ok: true; url: string }
  | { ok: false; error: string };

function isIpv4Private(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isIpv6Local(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80:')
  );
}

export function isBlockedHostOrIp(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (BLOCKED_HOSTS.has(h)) return true;
  if (isIpv4Private(h) || isIpv6Local(h)) return true;
  return false;
}

/** 同步静态校验（不解析 DNS）；供 Provider baseUrl 等沿用 */
export function validateOutboundUrlSync(
  raw: string,
  opts?: { stripTrailingSlash?: boolean },
): UrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'URL is required' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'URL must be a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must use http or https' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return { ok: false, error: 'URL hostname is required' };
  if (isBlockedHostOrIp(host)) {
    return { ok: false, error: `URL must not target private/loopback/metadata: ${host}` };
  }

  let out = parsed.toString();
  if (opts?.stripTrailingSlash) {
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      return {
        ok: false,
        error: 'URL must not end with / (e.g. use https://api.example.com/v1)',
      };
    }
    out = out.replace(/\/$/, '');
  }

  return { ok: true, url: out };
}

/** 动态 DNS + 静态；§6.4 完整路径 */
export async function validateOutboundUrl(
  raw: string,
  opts?: { stripTrailingSlash?: boolean },
): Promise<UrlValidation> {
  const sync = validateOutboundUrlSync(raw, opts);
  if (!sync.ok) return sync;

  const host = new URL(sync.url).hostname;
  if (isIP(host)) {
    return isBlockedHostOrIp(host)
      ? { ok: false, error: `URL must not target private/loopback/metadata: ${host}` }
      : sync;
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) {
      return { ok: false, error: `DNS lookup returned no addresses for ${host}` };
    }
    for (const r of records) {
      if (isBlockedHostOrIp(r.address)) {
        return {
          ok: false,
          error: `URL resolves to private/loopback address: ${r.address}`,
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: `DNS lookup failed for ${host}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return sync;
}

const MAX_REDIRECTS = 5;

/**
 * 带 SSRF 的 fetch：每次请求与重定向 Location 均校验；超时默认 5s。
 */
export function createSsrfFetch(timeoutMs = 5000): typeof fetch {
  return async (input, init) => {
    const startUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    let current = startUrl;
    let redirectCount = 0;

    while (true) {
      const check = await validateOutboundUrl(current);
      if (!check.ok) throw new Error(check.error);

      const controller = new AbortController();
      const outer = init?.signal;
      if (outer) {
        if (outer.aborted) controller.abort();
        else outer.addEventListener('abort', () => controller.abort(), { once: true });
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(check.url, {
          ...init,
          signal: controller.signal,
          redirect: 'manual',
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) return res;
          redirectCount += 1;
          if (redirectCount > MAX_REDIRECTS) {
            throw new Error('Too many redirects');
          }
          current = new URL(loc, check.url).toString();
          continue;
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
