import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { createSessionPolicyGate } from './tool-policy-gate.js';
import { ShellAllowlistStore } from '../permission/shell-allowlist-store.js';
import { PermissionBroker } from '../permission/permission-broker.js';

describe('createSessionPolicyGate shell allowlist', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('skips broker when command is allowlisted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-gate-al-'));
    dirs.push(dir);
    const shellAllowlist = new ShellAllowlistStore({
      path: join(dir, 'shell-allowlist.json'),
    });
    shellAllowlist.add('git push origin main');

    let asked = 0;
    const permissions = new PermissionBroker();
    permissions.setRequestHandler(() => {
      asked += 1;
    });

    const gate = createSessionPolicyGate({
      policy: new PolicyEngine(),
      permissions,
      shellAllowlist,
      getCtx: () => ({
        mode: 'agent',
        workspace: dir,
        sessionId: 's1',
      }),
    });

    const result = await gate(
      'bash',
      { command: 'git push origin main' },
      { toolCallId: 'tc1' },
    );
    expect(result.decision).toBe('allow');
    expect(result.reason).toMatch(/allowlist/i);
    expect(asked).toBe(0);
  });

  it('asks when not allowlisted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ciro-gate-ask-'));
    dirs.push(dir);
    const shellAllowlist = new ShellAllowlistStore({
      path: join(dir, 'shell-allowlist.json'),
    });
    const permissions = new PermissionBroker();
    permissions.setRequestHandler((req) => {
      expect(req.toolCallId).toBe('tc2');
      permissions.resolve(req.id, 'deny');
    });

    const gate = createSessionPolicyGate({
      policy: new PolicyEngine(),
      permissions,
      shellAllowlist,
      getCtx: () => ({
        mode: 'agent',
        workspace: dir,
        sessionId: 's1',
      }),
    });

    const result = await gate(
      'bash',
      { command: 'git push origin main' },
      { toolCallId: 'tc2' },
    );
    expect(result.decision).toBe('deny');
  });
});
