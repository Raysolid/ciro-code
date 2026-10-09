import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listDirectoryListing,
  listFileTree,
  listImmediateChildren,
  PREVIEW_MAX_LINES,
  readWorkspaceFile,
  searchWorkspacePaths,
  statWorkspaceFile,
} from './workspace-files.js';
import { SandboxError } from '../sandbox/path-sandbox.js';

describe('workspace-files', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-files-'));
  mkdirSync(join(workspace, 'src'));
  writeFileSync(join(workspace, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(workspace, 'README.md'), '# hi\n');
  writeFileSync(join(workspace, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  it('lists tree shallow by default', () => {
    const tree = listFileTree(workspace, '.');
    expect(tree.type).toBe('dir');
    const names = (tree.children ?? []).map((c) => c.name);
    expect(names).toContain('README.md');
    expect(names).toContain('src');
    const src = (tree.children ?? []).find((c) => c.name === 'src');
    expect(src?.type).toBe('dir');
    expect(src?.children).toBeUndefined();
    expect(src?.hasChildren).toBe(true);
  });

  it('lists deep tree when maxDepth > 1', () => {
    const tree = listFileTree(workspace, '.', 2);
    const src = (tree.children ?? []).find((c) => c.name === 'src');
    expect((src?.children ?? []).some((c) => c.name === 'a.ts')).toBe(true);
  });

  it('lists immediate children only', () => {
    const children = listImmediateChildren(workspace, 'src');
    expect(children.map((c) => c.name)).toContain('a.ts');
  });

  it('searches paths by substring and skips node_modules', () => {
    mkdirSync(join(workspace, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(workspace, 'node_modules', 'pkg', 'hidden.ts'), 'x');
    const hits = searchWorkspacePaths(workspace, 'a.ts');
    expect(hits.some((h) => h.path === 'src/a.ts')).toBe(true);
    expect(searchWorkspacePaths(workspace, 'hidden.ts')).toHaveLength(0);
    expect(searchWorkspacePaths(workspace, '   ')).toHaveLength(0);
  });

  it('compacts single-child directory chains', () => {
    mkdirSync(join(workspace, 'pkg', 'only', 'deep'), { recursive: true });
    writeFileSync(join(workspace, 'pkg', 'only', 'deep', 'Leaf.java'), 'class Leaf {}\n');
    const listing = listDirectoryListing(workspace, 'pkg', true);
    expect(listing.compactSegments).toEqual(['only', 'deep']);
    expect(listing.resolvedPath).toBe('pkg/only/deep');
    expect(listing.children.some((c) => c.name === 'Leaf.java')).toBe(true);
  });

  it('reads short file in full when limit omitted', () => {
    const file = readWorkspaceFile(workspace, 'src/a.ts');
    expect(file.content).toContain('export const a');
    expect(file.truncated).toBe(false);
    expect(file.totalLines).toBe(2);
    expect(file.nextOffset).toBeUndefined();
    expect(file.byteSize).toBeGreaterThan(0);
  });

  it('stats file kind', () => {
    expect(statWorkspaceFile(workspace, 'README.md').kind).toBe('markdown');
    expect(statWorkspaceFile(workspace, 'pic.png').kind).toBe('image');
  });

  it('rejects binary as text', () => {
    expect(() => readWorkspaceFile(workspace, 'pic.png')).toThrow(SandboxError);
  });

  it('paginates with limit and nextOffset', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line-${i + 1}`);
    writeFileSync(join(workspace, 'long.txt'), lines.join('\n'));
    const page1 = readWorkspaceFile(workspace, 'long.txt', { offset: 1, limit: 50 });
    expect(page1.content.split('\n')).toHaveLength(50);
    expect(page1.content.startsWith('line-1')).toBe(true);
    expect(page1.truncated).toBe(true);
    expect(page1.totalLines).toBe(120);
    expect(page1.nextOffset).toBe(51);

    const page2 = readWorkspaceFile(workspace, 'long.txt', {
      offset: page1.nextOffset,
      limit: 50,
    });
    expect(page2.content.startsWith('line-51')).toBe(true);
    expect(page2.nextOffset).toBe(101);

    const page3 = readWorkspaceFile(workspace, 'long.txt', {
      offset: page2.nextOffset,
      limit: 50,
    });
    expect(page3.truncated).toBe(false);
    expect(page3.nextOffset).toBeUndefined();
    expect(page3.content.endsWith('line-120')).toBe(true);
  });

  it('clamps explicit limit to PREVIEW_MAX_LINES', () => {
    const lines = Array.from({ length: PREVIEW_MAX_LINES + 50 }, (_, i) => `x${i}`);
    writeFileSync(join(workspace, 'huge-lines.txt'), lines.join('\n'));
    const file = readWorkspaceFile(workspace, 'huge-lines.txt', {
      offset: 1,
      limit: PREVIEW_MAX_LINES + 100,
    });
    expect(file.content.split('\n')).toHaveLength(PREVIEW_MAX_LINES);
    expect(file.truncated).toBe(true);
    expect(file.nextOffset).toBe(PREVIEW_MAX_LINES + 1);
  });
});
