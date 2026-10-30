import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInProcessTransport } from './in-process.js';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('InProcessTransport mock', () => {
  it('creates session and streams mock reply', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-tui-mock-'));
    dirs.push(ws);
    const transport = createInProcessTransport({
      workspace: ws,
      agentBackend: 'mock',
      mode: 'ask',
    });
    try {
      const session = await transport.createSession({ workspace: ws, mode: 'ask' });
      expect(session.id).toBeTruthy();
      const types: string[] = [];
      for await (const ev of transport.send(session.id, { message: 'hello' }, { mode: 'ask' })) {
        types.push(ev.type);
      }
      expect(types.some((t) => t === 'token' || t === 'complete')).toBe(true);
      expect(types).toContain('complete');
    } finally {
      transport.dispose();
    }
  }, 30_000);
});
