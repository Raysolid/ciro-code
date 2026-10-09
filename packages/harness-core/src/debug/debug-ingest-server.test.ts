import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  startDebugIngestServer,
  clearDebugLog,
  countDebugLogLines,
  stoppedDebugInfoFromPointer,
} from './debug-ingest-server.js';

describe('DebugIngestServer', () => {
  it('accepts POST NDJSON on loopback and appends to log', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'debug-ingest-'));
    const handle = await startDebugIngestServer({ workspace });
    expect(handle.ingestUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/ingest\//);
    expect(handle.logPathRel).toContain('.ciro/debug/');

    const res = await fetch(handle.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesisId: 'H1', message: 'hit', runId: 'pre-fix' }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(handle.logPath)).toBe(true);
    expect(countDebugLogLines(handle.logPath)).toBe(1);
    const line = readFileSync(handle.logPath, 'utf-8').trim();
    expect(line).toContain('H1');

    clearDebugLog(handle.logPath);
    expect(countDebugLogLines(handle.logPath)).toBe(0);

    const res2 = await fetch(handle.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesisId: 'H1', message: 'post-clear', runId: 'post-fix' }),
    });
    expect(res2.status).toBe(204);
    expect(countDebugLogLines(handle.logPath)).toBe(1);

    await handle.close();
  });

  it('rejects wrong token', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'debug-ingest-bad-'));
    const handle = await startDebugIngestServer({ workspace });
    const badUrl = handle.ingestUrl.replace(handle.ingestToken, 'deadbeef');
    const res = await fetch(badUrl, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    await handle.close();
  });

  it('refuses non-loopback bind', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'debug-ingest-host-'));
    await expect(
      startDebugIngestServer({ workspace, host: '0.0.0.0' }),
    ).rejects.toThrow(/loopback/i);
  });

  it('stoppedDebugInfoFromPointer uses logPathRel', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'debug-ptr-'));
    const logPathRel = '.ciro/debug/debug-abc.log';
    const info = stoppedDebugInfoFromPointer(workspace, {
      debugSessionId: 'abc',
      logPathRel,
    });
    expect(info.logPath).toBe(join(workspace, logPathRel));
    expect(info.logPathRel).toBe(logPathRel);
    expect(info.status).toBe('stopped');
    expect(info.ingestRunning).toBe(false);
  });
});
