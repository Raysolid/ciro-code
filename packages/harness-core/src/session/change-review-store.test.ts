import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChangeReviewError, ChangeReviewStore } from './change-review-store.js';

describe('ChangeReviewStore', () => {
  function setup() {
    const root = mkdtempSync(join(tmpdir(), 'ciro-review-'));
    const sessionDir = join(root, 'session');
    const workspace = join(root, 'ws');
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    const store = new ChangeReviewStore(sessionDir);
    return { store, workspace };
  }

  it('keeps first baseline across pending edits (reject restores v0)', () => {
    const { store, workspace } = setup();
    const rel = 'a.ts';
    const abs = join(workspace, rel);
    writeFileSync(abs, 'v0', 'utf-8');
    store.recordEdit(rel, 'v0', 'v1');
    writeFileSync(abs, 'v1', 'utf-8');
    store.recordEdit(rel, 'v1', 'v2');
    writeFileSync(abs, 'v2', 'utf-8');

    expect(store.readMeta(rel)?.disposition).toBe('pending');
    store.reject(workspace, rel);
    expect(readFileSync(abs, 'utf-8')).toBe('v0');
  });

  it('rejects restore baseline; accept re-applies after', () => {
    const { store, workspace } = setup();
    const rel = 'src/a.ts';
    const abs = join(workspace, rel);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(abs, 'before', 'utf-8');

    store.recordEdit(rel, 'before', 'after');
    writeFileSync(abs, 'after', 'utf-8');

    store.reject(workspace, rel);
    expect(readFileSync(abs, 'utf-8')).toBe('before');
    expect(store.readMeta(rel)?.disposition).toBe('rejected');

    store.accept(workspace, rel);
    expect(readFileSync(abs, 'utf-8')).toBe('after');
    expect(store.readMeta(rel)?.disposition).toBe('accepted');
  });

  it('rejects created file by deleting', () => {
    const { store, workspace } = setup();
    const rel = 'new.ts';
    const abs = join(workspace, rel);
    store.recordEdit(rel, '', 'hello');
    writeFileSync(abs, 'hello', 'utf-8');

    store.reject(workspace, rel);
    expect(existsSync(abs)).toBe(false);
    expect(store.readMeta(rel)?.disposition).toBe('rejected');
  });

  it('starts new baseline after accepted then edit', () => {
    const { store, workspace } = setup();
    const rel = 'b.ts';
    const abs = join(workspace, rel);
    writeFileSync(abs, 'a', 'utf-8');
    store.recordEdit(rel, 'a', 'b');
    writeFileSync(abs, 'b', 'utf-8');
    store.accept(workspace, rel);

    store.recordEdit(rel, 'b', 'c');
    writeFileSync(abs, 'c', 'utf-8');
    expect(store.readMeta(rel)?.disposition).toBe('pending');
    store.reject(workspace, rel);
    expect(readFileSync(abs, 'utf-8')).toBe('b');
  });

  it('throws when no snapshot', () => {
    const { store, workspace } = setup();
    expect(() => store.reject(workspace, 'missing.ts')).toThrow(ChangeReviewError);
    expect(() => store.accept(workspace, 'missing.ts')).toThrow(ChangeReviewError);
  });

  it('listDispositions reports reviewable', () => {
    const { store } = setup();
    store.recordEdit('x.ts', 'a', 'b');
    const map = store.listDispositions();
    expect(map.get('x.ts')).toEqual({ disposition: 'pending', reviewable: true });
  });
});
