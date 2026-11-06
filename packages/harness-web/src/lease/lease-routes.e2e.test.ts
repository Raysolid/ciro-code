import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore, loadConfig } from '@ciro-code/harness-core';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import { createHarnessApp } from '../app.js';

describe('session send concurrency', () => {
  it('allows either client when idle; rejects second send while busy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-busy-e2e-'));
    try {
      const config = loadConfig({
        workspace: root,
        agentBackend: 'mock',
        port: 0,
      });
      const sessionStore = new SessionStore({ sessionsRoot: join(root, 'sessions') });
      const runtime = createAgentRuntime(config, { sessionStore });
      const app = createHarnessApp({ config, runtime, sessionStore });

      const created = await app.request('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'agent' }),
      });
      expect(created.status).toBe(200);
      const session = (await created.json()) as { id: string };

      // 空闲：任意端可发（无需写租约）
      const idleSend = await app.request(`/api/v1/chat/${session.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-ciro-holder-id': 'web-ui',
        },
        body: JSON.stringify({ message: 'idle-ok' }),
      });
      expect(idleSend.status).toBe(200);
      await idleSend.text();

      // mock turn 极快结束；直接 stub busy 验证 HTTP 门禁
      const realBusy = runtime.isSessionBusy.bind(runtime);
      runtime.isSessionBusy = (id: string) => id === session.id || realBusy(id);
      try {
        const busySend = await app.request(`/api/v1/chat/${session.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'x-ciro-holder-id': 'tui-b',
          },
          body: JSON.stringify({ message: 'should-fail' }),
        });
        expect(busySend.status).toBe(409);
        const denied = (await busySend.json()) as { code?: string };
        expect(denied.code).toBe('SESSION_BUSY');
      } finally {
        runtime.isSessionBusy = realBusy;
      }

      // 恢复 idle 后另一端仍可发
      const again = await app.request(`/api/v1/chat/${session.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-ciro-holder-id': 'tui-b',
        },
        body: JSON.stringify({ message: 'idle-again' }),
      });
      expect(again.status).toBe(200);
      await again.text();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
