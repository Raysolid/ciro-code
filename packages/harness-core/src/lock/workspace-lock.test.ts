import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireWorkspaceLock,
  readWorkspaceLock,
  releaseWorkspaceLock,
} from './workspace-lock.js';

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    releaseWorkspaceLock(d);
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('workspace-lock', () => {
  it('acquires and releases', () => {
    const ws = mkdtempSync(join(tmpdir(), 'ciro-core-lock-'));
    dirs.push(ws);
    expect(acquireWorkspaceLock(ws, 'web').ok).toBe(true);
    expect(readWorkspaceLock(ws)?.kind).toBe('web');
    releaseWorkspaceLock(ws);
    expect(readWorkspaceLock(ws)).toBeNull();
  });
});
