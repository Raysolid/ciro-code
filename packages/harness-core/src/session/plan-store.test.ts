import { describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PlanStore,
  planFileName,
  planIdFromFileName,
  titleSlug,
} from './plan-store.js';

describe('plan file naming', () => {
  it('slugs titles and builds Cursor-style names', () => {
    expect(titleSlug('记忆向量去重升级')).toBe('记忆向量去重升级');
    expect(titleSlug('ppt 页数对齐')).toBe('ppt_页数对齐');
    expect(titleSlug('')).toBe('计划');
    expect(planFileName('记忆向量去重升级', 'ffcf1fd5')).toBe(
      '记忆向量去重升级_ffcf1fd5.plan.md',
    );
    expect(planIdFromFileName('记忆向量去重升级_ffcf1fd5.plan.md')).toBe('ffcf1fd5');
    expect(planIdFromFileName('abc123def456.md')).toBe('abc123def456');
  });
});

describe('PlanStore', () => {
  it('creates, updates, lists and confirms plans', () => {
    const root = mkdtempSync(join(tmpdir(), 'plan-store-'));
    const store = new PlanStore({ sessionsRoot: root });
    const created = store.create('s1', {
      title: '记忆向量去重升级',
      markdown: '## Steps\n\n1. Auth\n',
      todos: [{ id: 't1', content: 'Wire auth', status: 'pending' }],
    });
    expect(created.planId).toMatch(/^[a-f0-9]{8}$/i);
    expect(readdirSync(store.plansDir('s1'))).toEqual([
      `记忆向量去重升级_${created.planId}.plan.md`,
    ]);
    expect(store.read('s1', created.planId)?.title).toBe('记忆向量去重升级');

    const updated = store.update('s1', created.planId, {
      title: 'ppt 页数对齐优化',
      markdown: '## Steps\n\n1. Auth\n2. Session\n',
    });
    expect(updated.markdown).toContain('Session');
    expect(readdirSync(store.plansDir('s1'))).toEqual([
      `ppt_页数对齐优化_${created.planId}.plan.md`,
    ]);

    const confirmed = store.markConfirmed('s1', created.planId);
    expect(confirmed.confirmedAt).toBeTruthy();

    const list = store.list('s1');
    expect(list).toHaveLength(1);
    expect(list[0]?.confirmed).toBe(true);

    const workspace = mkdtempSync(join(tmpdir(), 'plan-ws-'));
    const saved = store.saveToWorkspace('s1', created.planId, workspace);
    expect(saved.pathRel).toBe(
      `.ciro/plans/ppt_页数对齐优化_${created.planId}.plan.md`,
    );
    expect(existsSync(saved.absolutePath)).toBe(true);
  });

  it('reads legacy {planId}.md files', () => {
    const root = mkdtempSync(join(tmpdir(), 'plan-legacy-'));
    const store = new PlanStore({ sessionsRoot: root });
    const dir = store.plansDir('s1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'legacyid0001.md'),
      '---\ntitle: "Old"\ncreatedAt: 1\nupdatedAt: 1\ntodos: []\n---\n\nbody\n',
      'utf-8',
    );
    expect(store.read('s1', 'legacyid0001')?.title).toBe('Old');
    expect(store.list('s1')[0]?.planId).toBe('legacyid0001');
  });
});
