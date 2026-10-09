import { describe, expect, it } from 'vitest';
import { PolicyEngine, createSessionPolicyGate } from '@ciro/harness-core';
import {
  createWebFetchTool,
  extractWebFetchTitle,
  formatWebFetchResult,
  htmlToReadableText,
  normalizeWebFetchUrl,
  WEB_FETCH_MAX_BODY_CHARS,
} from './web-fetch-tool.js';

describe('normalizeWebFetchUrl', () => {
  it('upgrades http to https', () => {
    const r = normalizeWebFetchUrl('http://example.com/a');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://example.com/a');
  });

  it('rejects credentials', () => {
    const r = normalizeWebFetchUrl('https://user:pass@example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/credentials/i);
  });

  it('rejects invalid url', () => {
    expect(normalizeWebFetchUrl('not a url').ok).toBe(false);
  });
});

describe('extractWebFetchTitle', () => {
  it('prefers html title over h1', () => {
    const html =
      '<html><head><title>Cursor &amp; Claude</title></head><body><h1>Ignored</h1></body></html>';
    expect(extractWebFetchTitle(html, 'text/html')).toBe('Cursor & Claude');
  });

  it('falls back to h1 then markdown heading', () => {
    expect(extractWebFetchTitle('<html><h1>Hello <b>World</b></h1></html>', 'text/html')).toBe(
      'Hello World',
    );
    expect(extractWebFetchTitle('# Page title\n\nbody', 'text/markdown')).toBe('Page title');
  });
});

describe('htmlToReadableText', () => {
  it('strips script and tags, keeps link text', () => {
    const out = htmlToReadableText(
      '<html><script>alert(1)</script><p>Hi <a href="https://ex.com">Ex</a></p></html>',
    );
    expect(out.toLowerCase()).not.toContain('<html');
    expect(out).not.toMatch(/alert/);
    expect(out).toContain('Hi');
    expect(out).toContain('https://ex.com');
  });
});

describe('createWebFetchTool', () => {
  const policy = new PolicyEngine();
  const askGate = createSessionPolicyGate({
    policy,
    getCtx: () => ({ mode: 'ask', workspace: '/tmp' }),
  });

  it('denies loopback after https upgrade', async () => {
    const tool = createWebFetchTool(askGate);
    const result = await tool.execute('t1', { url: 'http://127.0.0.1/' });
    expect(result.details.error).toBe(true);
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toMatch(/private|loopback/i);
  });

  it('denies credential urls before fetch', async () => {
    const tool = createWebFetchTool(askGate);
    const result = await tool.execute('t2', { url: 'https://u:p@example.com/' });
    expect(result.details.error).toBe(true);
  });

  it('returns formatted markdown from injected fetch', async () => {
    const html =
      '<html><head><title>Doc Title</title></head><style>x{}</style><p>Hello <a href="/x">X</a></p></html>';
    const tool = createWebFetchTool(askGate, {
      ssrfFetch: async () =>
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const result = await tool.execute('t3', { url: 'https://example.com/doc' });
    expect(result.details.error).toBe(false);
    expect(result.details).not.toHaveProperty('title');
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toContain('status: 200');
    expect(text).toContain('title: Doc Title');
    expect(text).toContain('finalUrl:');
    expect(text.toLowerCase()).not.toContain('<html');
    expect(text).toContain('Hello');
  });

  it('marks truncated when body exceeds cap', async () => {
    const body = 'a'.repeat(WEB_FETCH_MAX_BODY_CHARS + 50);
    const tool = createWebFetchTool(askGate, {
      ssrfFetch: async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    });
    const result = await tool.execute('t4', { url: 'https://example.com/big' });
    const text = result.content[0] && 'text' in result.content[0] ? result.content[0].text : '';
    expect(text).toContain('truncated: true');
    expect(formatWebFetchResult({ status: 200, finalUrl: 'https://x', truncated: true, body: 'z' })).toContain(
      'truncated: true',
    );
  });
});
