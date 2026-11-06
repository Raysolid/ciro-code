import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLog } from './audit-log.js';

describe('AuditLog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-audit-'));
  const dbPath = join(dir, 'audit.db');
  let log: AuditLog;

  afterEach(() => {
    log?.close();
  });

  it('appends and lists entries', () => {
    log = new AuditLog(dbPath);
    const entry = log.append({
      timestamp: new Date().toISOString(),
      sessionId: 's1',
      mode: 'ask',
      tool: 'write',
      source: 'builtin',
      decision: 'deny',
      reason: 'Ask mode',
      targetSummary: 'x.ts',
    });
    expect(entry.id).toBeGreaterThan(0);
    const list = log.list({ sessionId: 's1' });
    expect(list).toHaveLength(1);
    expect(list[0]!.tool).toBe('write');
    expect(list[0]!.decision).toBe('deny');
  });
});
