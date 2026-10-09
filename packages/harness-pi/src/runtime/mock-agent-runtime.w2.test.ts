import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockAgentRuntime } from './mock-agent-runtime.js';
import { createHarnessConfig } from '@ciro/harness-shared';
import { AuditLog, PermissionBroker, SessionStore } from '@ciro/harness-core';

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iter) items.push(item);
  return items;
}

describe('MockAgentRuntime W2', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-mock-w2-'));
  writeFileSync(join(workspace, 'README.md'), '# Hello Harness');
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'harness-mock-w2-sess-'));
  const auditPath = join(workspace, 'audit.db');

  function makeRuntime(mode: 'ask' | 'agent' = 'ask') {
    const config = createHarnessConfig({
      workspace,
      mode,
      agentBackend: 'mock',
    });
    return new MockAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot }),
      auditLog: new AuditLog(auditPath),
      permissionBroker: new PermissionBroker(),
    });
  }

  it('Ask mode denies write and audits', async () => {
    const runtime = makeRuntime('ask');
    const session = await runtime.createSession({ workspace, mode: 'ask' });
    const events = await collect(
      runtime.sendMessage(
        session.id,
        { message: 'Please write to file.txt' },
        { sessionId: session.id, mode: 'ask', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'error')).toBe(true);
    const audit = runtime.listAudit({ sessionId: session.id });
    expect(audit.some((a) => a.tool === 'write' && a.decision === 'deny')).toBe(true);
  });

  it('Agent mode writes a file', async () => {
    const runtime = makeRuntime('agent');
    const session = await runtime.createSession({ workspace, mode: 'agent' });
    const events = await collect(
      runtime.sendMessage(
        session.id,
        { message: 'write notes.txt <<<hello w2>>>' },
        { sessionId: session.id, mode: 'agent', workspace },
      ),
    );
    expect(events.some((e) => e.type === 'tool_call_start')).toBe(true);
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(existsSync(join(workspace, 'notes.txt'))).toBe(true);
    expect(readFileSync(join(workspace, 'notes.txt'), 'utf-8')).toBe('hello w2');
  });

  it('Agent bash force-push is denied before exec', async () => {
    const runtime = makeRuntime('agent');
    const session = await runtime.createSession({ workspace, mode: 'agent' });
    const events = await collect(
      runtime.sendMessage(
        session.id,
        { message: 'bash <<<git push --force origin main>>>' },
        { sessionId: session.id, mode: 'agent', workspace },
      ),
    );
    expect(
      events.some(
        (e) =>
          e.type === 'tool_call_result' &&
          (e.payload as { toolName?: string; isError?: boolean }).toolName === 'bash' &&
          (e.payload as { isError?: boolean }).isError === true,
      ),
    ).toBe(true);
    const audit = runtime.listAudit({ sessionId: session.id });
    expect(audit.some((a) => a.tool === 'bash' && a.decision === 'deny')).toBe(true);
  });

  it('permission ask can be approved', async () => {
    const broker = new PermissionBroker();
    const config = createHarnessConfig({
      workspace,
      mode: 'agent',
      agentBackend: 'mock',
      tools: ['bash', 'read', 'list_files', 'grep'],
    });
    const runtime = new MockAgentRuntime(config, {
      sessionStore: new SessionStore({ sessionsRoot }),
      auditLog: new AuditLog(join(workspace, 'audit-perm.db')),
      permissionBroker: broker,
    });
    const session = await runtime.createSession({ workspace, mode: 'agent' });

    const events: Array<{ type: string; payload?: unknown }> = [];
    const iter = runtime.sendMessage(
      session.id,
      { message: 'bash <<<git push origin main>>>' },
      { sessionId: session.id, mode: 'agent', workspace },
    );
    for await (const e of iter) {
      events.push(e);
      if (e.type === 'permission_request') {
        const payload = e.payload as { permissionId: string };
        await runtime.resolvePermission(payload.permissionId, 'allow');
      }
    }
    expect(events.some((e) => e.type === 'permission_request')).toBe(true);
  });
});
