import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionTrustStore } from './extension-trust-store.js';
import { ExtensionHost, isExtToolName } from './extension-host.js';

function writeExt(
  root: string,
  dirName: string,
  manifest: object,
  mainSource?: string,
  mainFile = 'main.mjs',
): string {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'extension.json'), JSON.stringify(manifest), 'utf-8');
  if (mainSource !== undefined) {
    writeFileSync(join(dir, mainFile), mainSource, 'utf-8');
  }
  return dir;
}

const PING_MAIN = `
export function activate(ctx) {
  ctx.registerTool({
    name: 'ping',
    description: 'ping',
    readOnlyHint: true,
    execute: async () => 'pong',
  });
}
`;

describe('isExtToolName', () => {
  it('requires ext:{id}:{name}', () => {
    expect(isExtToolName('ext:hello:ping')).toBe(true);
    expect(isExtToolName('mcp:fs:read')).toBe(false);
    expect(isExtToolName('ext:hello')).toBe(false);
  });
});

describe('ExtensionHost', () => {
  it('does not import untrusted extensions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-u-'));
    writeExt(
      root,
      'hello',
      { id: 'hello', name: 'Hello', version: '1.0.0', main: 'main.mjs' },
      `import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./LOADED', import.meta.url), 'yes');
export function activate() {}
`,
    );
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    await host.ensureLoaded();
    expect(host.listTools()).toEqual([]);
    expect(host.list().extensions[0]?.trusted).toBe(false);
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(root, 'hello', 'LOADED'))).toBe(false);
  });

  it('loads tools after trust; untrust drops them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-t-'));
    writeExt(
      root,
      'hello',
      { id: 'hello', name: 'Hello', version: '1.0.0', main: 'main.mjs' },
      PING_MAIN,
    );
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    const item = await host.trust('hello');
    expect(item.trusted).toBe(true);
    expect(item.loadError).toBeUndefined();
    expect(host.listTools().map((t) => t.fullName)).toEqual(['ext:hello:ping']);
    expect(host.activeNames('ask')).toEqual(['ext:hello:ping']);
    expect(host.getReadOnlyHint('ext:hello:ping')).toBe(true);

    const after = host.untrust('hello');
    expect(after.trusted).toBe(false);
    expect(host.listTools()).toEqual([]);
    expect(host.activeNames('agent')).toEqual([]);
  });

  it('Ask omits write-class tools from active names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-w-'));
    writeExt(
      root,
      'w',
      { id: 'w', name: 'W', version: '1.0.0', main: 'main.mjs' },
      `
export function activate(ctx) {
  ctx.registerTool({
    name: 'readish',
    description: 'r',
    readOnlyHint: true,
    execute: async () => 'ok',
  });
  ctx.registerTool({
    name: 'writeish',
    description: 'w',
    readOnlyHint: false,
    execute: async () => 'ok',
  });
}
`,
    );
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    await host.trust('w');
    expect(host.activeNames('ask')).toEqual(['ext:w:readish']);
    expect(host.activeNames('plan')).toEqual(['ext:w:readish']);
    expect(host.activeNames('agent').sort()).toEqual([
      'ext:w:readish',
      'ext:w:writeish',
    ]);
  });

  it('records loadError when main is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-m-'));
    writeExt(root, 'x', { id: 'x', name: 'X', version: '1.0.0' });
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    const item = await host.trust('x');
    expect(item.trusted).toBe(true);
    expect(item.loadError).toMatch(/missing main/i);
    expect(host.listTools()).toEqual([]);
  });

  it('rejects main that escapes the extension directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-esc-'));
    writeFileSync(join(root, 'evil.mjs'), 'export function activate() {}', 'utf-8');
    writeExt(root, 'x', {
      id: 'x',
      name: 'X',
      version: '1.0.0',
      main: '../evil.mjs',
    });
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    const item = await host.trust('x');
    expect(item.loadError).toMatch(/escapes/i);
    expect(host.listTools()).toEqual([]);
  });

  it('requires readOnlyHint on registerTool', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-hint-'));
    writeExt(
      root,
      'x',
      { id: 'x', name: 'X', version: '1.0.0', main: 'main.mjs' },
      `
export function activate(ctx) {
  ctx.registerTool({
    name: 'ping',
    description: 'ping',
    execute: async () => 'pong',
  });
}
`,
    );
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    const item = await host.trust('x');
    expect(item.loadError).toMatch(/readOnlyHint/i);
  });

  it('notify during activate reaches ui sink', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ext-host-n-'));
    const notes: string[] = [];
    writeExt(
      root,
      'n',
      { id: 'n', name: 'N', version: '1.0.0', main: 'main.mjs' },
      `
export function activate(ctx) {
  ctx.ui.notify('info', 'hi');
}
`,
    );
    const store = new ExtensionTrustStore({
      extensionsRoot: root,
      trustPath: join(root, 'trust.json'),
    });
    const host = new ExtensionHost({ store });
    host.setUiSink((level, message) => {
      notes.push(`${level}:${message}`);
    });
    await host.trust('n');
    expect(notes).toEqual(['info:hi']);
  });
});
