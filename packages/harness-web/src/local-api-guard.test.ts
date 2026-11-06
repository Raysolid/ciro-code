import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { hostnameOf, isLoopbackHostname, localApiGuard } from './local-api-guard.js';

describe('localApiGuard helpers', () => {
  it('parses Host hostname', () => {
    expect(hostnameOf('127.0.0.1:3000')).toBe('127.0.0.1');
    expect(hostnameOf('localhost:5173')).toBe('localhost');
    expect(hostnameOf('[::1]:8080')).toBe('::1');
  });

  it('recognizes loopback hostnames', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('evil.com')).toBe(false);
  });
});

describe('localApiGuard', () => {
  function app() {
    const h = new Hono();
    h.use('*', localApiGuard);
    h.get('/api/v1/ping', (c) => c.json({ ok: true }));
    h.put('/api/v1/mcp/servers', (c) => c.json({ ok: true }));
    return h;
  }

  it('allows loopback Origin and Host', async () => {
    const res = await app().request('/api/v1/ping', {
      headers: {
        Host: '127.0.0.1:3921',
        Origin: 'http://127.0.0.1:3921',
      },
    });
    expect(res.status).toBe(200);
  });

  it('allows missing Origin (TUI / same-machine clients)', async () => {
    const res = await app().request('/api/v1/ping', {
      headers: { Host: '127.0.0.1:3921' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects non-loopback Origin', async () => {
    const res = await app().request('/api/v1/mcp/servers', {
      method: 'PUT',
      headers: {
        Host: '127.0.0.1:3921',
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('rejects non-loopback Host (DNS rebinding)', async () => {
    const res = await app().request('/api/v1/ping', {
      headers: { Host: 'evil.example' },
    });
    expect(res.status).toBe(403);
  });
});
