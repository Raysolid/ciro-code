import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionTrustStore } from './extension-trust-store.js';

function writeExt(root: string, dirName: string, manifest: object): void {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'extension.json'), JSON.stringify(manifest), 'utf-8');
}

describe('ExtensionTrustStore', () => {
  it('discovers manifests and defaults to untrusted', () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-disc-'));
    writeExt(root, 'hello', { id: 'hello', name: 'Hello', version: '1.0.0' });
    mkdirSync(join(root, 'no-manifest'), { recursive: true });

    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const list = store.list().extensions;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'hello',
      name: 'Hello',
      version: '1.0.0',
      trusted: false,
    });
  });

  it('trust / untrust round-trips and persists', () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-trust-'));
    writeExt(root, 'demo', { id: 'demo', name: 'Demo', version: '0.1.0' });
    const trustPath = join(root, 'trust.json');

    const store = new ExtensionTrustStore({ extensionsRoot: root, trustPath });
    expect(store.trust('demo').trusted).toBe(true);

    const again = new ExtensionTrustStore({ extensionsRoot: root, trustPath });
    expect(again.list().extensions[0]?.trusted).toBe(true);
    expect(again.isTrusted('demo')).toBe(true);

    expect(again.untrust('demo').trusted).toBe(false);
    expect(again.isTrusted('demo')).toBe(false);
  });

  it('throws when trusting unknown id', () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-miss-'));
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    expect(() => store.trust('missing')).toThrow(/not found/i);
  });
});
