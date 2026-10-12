import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, SessionStore, ExtensionTrustStore } from '@ciro-code/harness-core';
import { createAgentRuntime } from '@ciro-code/harness-pi';
import { createHarnessApp } from './app.js';

function writeExt(
  root: string,
  dirName: string,
  manifest: object,
  mainSource?: string,
): void {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'extension.json'), JSON.stringify(manifest), 'utf-8');
  if (mainSource !== undefined) {
    writeFileSync(join(dir, 'main.mjs'), mainSource, 'utf-8');
  }
}

describe('extension host API', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'ext-e2e-ws-'));
  writeFileSync(join(workspace, 'README.md'), '# fixture\n');
  const extRoot = mkdtempSync(join(tmpdir(), 'ext-e2e-root-'));
  writeExt(
    extRoot,
    'hello',
    { id: 'hello', name: 'Hello', version: '1.0.0', main: 'main.mjs' },
    `export function activate(ctx) {
  ctx.registerTool({
    name: 'ping',
    description: 'ping',
    readOnlyHint: true,
    execute: async () => 'pong',
  });
}
`,
  );
  writeExt(extRoot, 'broken', { id: 'broken', name: 'Broken', version: '0.0.1' });

  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'ask',
    port: 0,
  });
  const sessionStore = new SessionStore({
    sessionsRoot: join(workspace, 'sessions'),
  });
  const runtime = createAgentRuntime(config, { sessionStore });
  const extensionTrustStore = new ExtensionTrustStore({
    extensionsRoot: extRoot,
    trustPath: join(extRoot, 'trust.json'),
  });
  const app = createHarnessApp({
    config,
    runtime,
    sessionStore,
    extensionTrustStore,
  });

  it('lists untrusted by default and does not report loadError', async () => {
    const res = await app.request('/api/v1/extensions');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      extensions: Array<{ id: string; trusted: boolean; loadError?: string }>;
    };
    const hello = body.extensions.find((e) => e.id === 'hello');
    expect(hello?.trusted).toBe(false);
    expect(hello?.loadError).toBeUndefined();
  });

  it('trusts, loads tools, then untrusts', async () => {
    const trust = await app.request('/api/v1/extensions/hello/trust', {
      method: 'POST',
    });
    expect(trust.status).toBe(200);
    const trusted = (await trust.json()) as { trusted: boolean; loadError?: string };
    expect(trusted.trusted).toBe(true);
    expect(trusted.loadError).toBeUndefined();

    const untrust = await app.request('/api/v1/extensions/hello/untrust', {
      method: 'POST',
    });
    expect(untrust.status).toBe(200);
    const after = (await untrust.json()) as { trusted: boolean };
    expect(after.trusted).toBe(false);
  });

  it('trusts missing main with loadError', async () => {
    const res = await app.request('/api/v1/extensions/broken/trust', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { trusted: boolean; loadError?: string };
    expect(body.trusted).toBe(true);
    expect(body.loadError).toMatch(/missing main/i);
  });
});
