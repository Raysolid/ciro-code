import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  createSsrfFetch,
  isPolicyBlocked,
  policyBlockMessage,
  validateOutboundUrl,
  type ToolPolicyGate,
} from '@ciro/harness-core';

export const WEB_FETCH_TOOL_NAME = 'WebFetch';
export const WEB_FETCH_TIMEOUT_MS = 30_000;
export const WEB_FETCH_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
export const WEB_FETCH_MAX_BODY_CHARS = 100_000;
export const WEB_FETCH_USER_AGENT = 'CiroHarness/0.1';
export const WEB_FETCH_ACCEPT =
  'text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.7';

export const WEB_FETCH_DESCRIPTION = `Fetch a public http(s) URL and return truncated readable text (markdown/plain). Private, loopback, and authenticated URLs fail. Prefer gh CLI or a GitHub MCP for GitHub. Use an enabled search MCP to discover URLs; do not use bash curl/wget. Kernel WebFetch is the page reader — do not substitute an MCP fetch tool.`;

export type NormalizeUrlResult = { ok: true; url: string } | { ok: false; error: string };

export function normalizeWebFetchUrl(raw: string): NormalizeUrlResult {
  const s = raw.trim();
  if (!s) return { ok: false, error: 'url is required' };
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: `Invalid URL "${raw}"` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URL must not include credentials' };
  }
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must use http or https' };
  }
  return { ok: true, url: parsed.toString() };
}

export function htmlToReadableText(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const t = inner.replace(/<[^>]+>/g, '').trim();
      return t ? `${t} (${href})` : href;
    },
  );
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(s).replace(/\n{3,}/g, '\n\n').trim();
}

const WEB_FETCH_TITLE_MAX = 80;

/** Cheap page label: <title>, else first h1, else first markdown heading. */
export function extractWebFetchTitle(raw: string, contentType: string): string | undefined {
  const ct = contentType.toLowerCase();
  if (ct.includes('html')) {
    const title = innerHtmlText(raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    if (title) return clipTitle(title);
    const h1 = innerHtmlText(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
    if (h1) return clipTitle(h1);
  }
  const heading = raw.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  return heading ? clipTitle(collapseWs(heading)) : undefined;
}

export function formatWebFetchResult(opts: {
  status: number;
  finalUrl: string;
  truncated: boolean;
  body: string;
  title?: string;
}): string {
  const header = [
    `status: ${opts.status}`,
    `finalUrl: ${opts.finalUrl}`,
    `truncated: ${opts.truncated}`,
  ];
  if (opts.title) header.push(`title: ${opts.title}`);
  return `${header.join('\n')}\n---\n${opts.body}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function innerHtmlText(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = collapseWs(decodeHtmlEntities(raw.replace(/<[^>]+>/g, '')));
  return t || undefined;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function clipTitle(s: string): string {
  return s.length > WEB_FETCH_TITLE_MAX ? `${s.slice(0, WEB_FETCH_TITLE_MAX - 1)}…` : s;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ buf: Buffer; truncated: boolean }> {
  if (!res.body) return { buf: Buffer.alloc(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    if (total + value.length > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  return { buf: Buffer.concat(chunks), truncated };
}

function decodeBody(raw: string, contentType: string): string {
  return contentType.toLowerCase().includes('html') ? htmlToReadableText(raw) : raw;
}

export type WebFetchSsrfFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createWebFetchTool(
  gate?: ToolPolicyGate,
  opts?: { ssrfFetch?: WebFetchSsrfFetch },
) {
  const ssrfFetch = opts?.ssrfFetch ?? createSsrfFetch(WEB_FETCH_TIMEOUT_MS);
  return defineTool({
    name: WEB_FETCH_TOOL_NAME,
    label: 'Web Fetch',
    description: WEB_FETCH_DESCRIPTION,
    parameters: Type.Object({
      url: Type.String({ description: 'Fully-formed http(s) URL to fetch' }),
    }),
    execute: async (_toolCallId, params) => {
      const fail = (text: string) => ({
        content: [{ type: 'text' as const, text }],
        details: { error: true },
      });
      try {
        if (gate) {
          const decision = await gate(
            WEB_FETCH_TOOL_NAME,
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }
        const raw = typeof params.url === 'string' ? params.url : '';
        const normalized = normalizeWebFetchUrl(raw);
        if (!normalized.ok) return fail(normalized.error);

        const check = await validateOutboundUrl(normalized.url);
        if (!check.ok) return fail(check.error);

        const res = await ssrfFetch(check.url, {
          method: 'GET',
          headers: {
            Accept: WEB_FETCH_ACCEPT,
            'User-Agent': WEB_FETCH_USER_AGENT,
          },
        });
        const { buf, truncated: bytesTrunc } = await readCapped(res, WEB_FETCH_MAX_DOWNLOAD_BYTES);
        const ct = res.headers.get('content-type') ?? '';
        const payload = buf.toString('utf8');
        const title = extractWebFetchTitle(payload, ct);
        let body = decodeBody(payload, ct);
        let truncated = bytesTrunc;
        if (body.length > WEB_FETCH_MAX_BODY_CHARS) {
          body = body.slice(0, WEB_FETCH_MAX_BODY_CHARS);
          truncated = true;
        }
        const finalUrl = res.url || check.url;
        const text = formatWebFetchResult({
          status: res.status,
          finalUrl,
          truncated,
          body,
          title,
        });
        return {
          content: [{ type: 'text' as const, text }],
          details: { error: res.status >= 400, status: res.status, finalUrl, truncated },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(msg);
      }
    },
  });
}
