import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PackStore, assertOfficialPackId, isOfficialPackId } from './pack-store.js';

function writeSmokePack(dir: string, id = '@ciro/ext-smoke') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: id, version: '0.1.0', private: true }, null, 2),
  );
  writeFileSync(
    join(dir, 'ciro.pack.json'),
    JSON.stringify(
      {
        id,
        displayName: 'Smoke',
        version: '0.1.0',
        contributions: { sidePanels: [{ id: 'smoke', label: 'Smoke' }] },
      },
      null,
      2,
    ),
  );
}

describe('PackStore', () => {
  it('rejects non-official pack ids', () => {
    expect(isOfficialPackId('@ciro/ext-smoke')).toBe(true);
    expect(isOfficialPackId('lodash')).toBe(false);
    expect(() => assertOfficialPackId('../evil')).toThrow(/official/);
  });

  it('install ≠ enable; enable registers side panel; disable clears', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-'));
    const src = join(root, 'src-smoke');
    writeSmokePack(src);
    const store = new PackStore({ packsRoot: join(root, 'packs') });
    store.ensureLayout();

    const installed = store.addFromDirectory('@ciro/ext-smoke', src);
    expect(installed.enabled).toBe(false);
    expect(store.list().contributions.sidePanels).toHaveLength(0);

    const enabled = store.setEnabled('@ciro/ext-smoke', true);
    expect(enabled.enabled).toBe(true);
    expect(store.list().contributions.sidePanels).toEqual([
      { packId: '@ciro/ext-smoke', id: 'smoke', label: 'Smoke' },
    ]);

    store.setEnabled('@ciro/ext-smoke', false);
    expect(store.list().contributions.sidePanels).toHaveLength(0);

    store.remove('@ciro/ext-smoke');
    expect(store.list().packs).toHaveLength(0);
  });

  it('rejects addFromDirectory for mismatched id', () => {
    const root = mkdtempSync(join(tmpdir(), 'packs-bad-'));
    const src = join(root, 'src');
    writeSmokePack(src, '@ciro/ext-smoke');
    const store = new PackStore({ packsRoot: join(root, 'packs') });
    expect(() => store.addFromDirectory('@ciro/ext-other', src)).toThrow(/does not match/);
  });
});
