import type { MiddlewareHandler } from 'hono';

/** 从 Host 头取出 hostname（支持 `[::1]:port` / `127.0.0.1:port` / `localhost:port`） */
export function hostnameOf(hostHeader: string): string {
  const raw = hostHeader.trim().toLowerCase();
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end >= 0 ? raw.slice(1, end) : raw;
  }
  const idx = raw.lastIndexOf(':');
  if (idx > 0 && /^\d+$/.test(raw.slice(idx + 1))) {
    return raw.slice(0, idx);
  }
  return raw;
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1';
}

/** 本机 daemon：仅 loopback Host / Origin，防开放 CORS 与 DNS rebinding */
export const localApiGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin) {
    try {
      const u = new URL(origin);
      if (!isLoopbackHostname(u.hostname)) {
        return c.json({ error: 'Cross-origin requests are not allowed' }, 403);
      }
    } catch {
      return c.json({ error: 'Invalid Origin' }, 403);
    }
  }

  const host = c.req.header('Host');
  if (host) {
    if (!isLoopbackHostname(hostnameOf(host))) {
      return c.json({ error: 'Invalid Host' }, 403);
    }
  }

  await next();
};
