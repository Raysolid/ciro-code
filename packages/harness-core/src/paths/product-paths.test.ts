import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveReadable,
  WS_DIR,
  LEGACY_WS_DIR,
  projectConfigPath,
  legacyProjectConfigPath,
  memoryDir,
} from './product-paths.js';
import { migrateProductDirs, runDoctor } from './migrate-product-dirs.js';

describe('product-paths', () => {
  it('resolveReadable prefers primary when both exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'paths-both-'));
    const primary = join(root, 'a.txt');
    const legacy = join(root, 'b.txt');
    writeFileSync(primary, 'p');
    writeFileSync(legacy, 'l');
    expect(resolveReadable(primary, legacy)).toEqual({ path: primary, fromLegacy: false });
  });

  it('resolveReadable falls back to legacy', () => {
    const root = mkdtempSync(join(tmpdir(), 'paths-leg-'));
    const primary = join(root, 'missing.txt');
    const legacy = join(root, 'legacy.txt');
    writeFileSync(legacy, 'l');
    expect(resolveReadable(primary, legacy)).toEqual({ path: legacy, fromLegacy: true });
  });

  it('resolveReadable returns primary when neither exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'paths-none-'));
    const primary = join(root, 'new.txt');
    const legacy = join(root, 'old.txt');
    expect(resolveReadable(primary, legacy)).toEqual({ path: primary, fromLegacy: false });
  });

  it('ws helpers use .ciro / .pi', () => {
    const ws = '/tmp/ws';
    expect(projectConfigPath(ws).replace(/\\/g, '/')).toContain(`/${WS_DIR}/config.yaml`);
    expect(legacyProjectConfigPath(ws).replace(/\\/g, '/')).toContain(
      `/${LEGACY_WS_DIR}/config.yaml`,
    );
    expect(memoryDir(ws).replace(/\\/g, '/')).toContain(`/${WS_DIR}/memory`);
  });
});

describe('migrateProductDirs', () => {
  it('copies legacy workspace config into .ciro', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'migrate-ws-'));
    mkdirSync(join(workspace, '.pi'), { recursive: true });
    writeFileSync(join(workspace, '.pi', 'config.yaml'), 'mode: ask\n');
    mkdirSync(join(workspace, '.pi', 'memory'), { recursive: true });
    writeFileSync(join(workspace, '.pi', 'memory', 'MEMORY.md'), '# old\n');

    const result = migrateProductDirs({ workspace });
    expect(result.errors).toEqual([]);
    expect(result.copied.some((c) => c.includes('project config'))).toBe(true);
    expect(result.copied.some((c) => c.includes('memory'))).toBe(true);

    const doctor = runDoctor({ workspace });
    expect(doctor.findings.some((f) => f.message.includes('legacy workspace'))).toBe(true);
  });
});
