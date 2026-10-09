import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, SessionStore, ProviderStore } from '@ciro/harness-core';
import { createAgentRuntime } from '@ciro/harness-pi';
import { createHarnessApp } from './app.js';

describe('harness-web Phase3 M0 providers API', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'harness-web-prov-'));
  writeFileSync(join(workspace, 'README.md'), '# fixture\n');
  mkdirSync(join(workspace, '.pi'), { recursive: true });
  const providersDir = join(workspace, 'agent-home');
  const providerStore = new ProviderStore({
    providersPath: join(providersDir, 'providers.json'),
    keysPath: join(providersDir, 'credentials', 'provider-keys.json'),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'local' }, { id: 'remote-new' }],
        }),
        { status: 200 },
      ),
  });

  const config = loadConfig({
    workspace,
    agentBackend: 'mock',
    mode: 'ask',
    port: 0,
  });
  const sessionStore = new SessionStore({ sessionsRoot: join(workspace, 'sessions') });
  const runtime = createAgentRuntime(config, { sessionStore, providerStore });
  const app = createHarnessApp({ config, runtime, sessionStore, providerStore });

  it('lists empty providers with guidance', async () => {
    const res = await app.request('/api/v1/settings/models/providers');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: unknown[];
      guidance: { message?: string; canImportFromEnv: boolean };
    };
    expect(body.providers).toEqual([]);
    expect(body.guidance.message).toBeTruthy();
  });

  it('CRUD provider masks api key and persists', async () => {
    const createRes = await app.request('/api/v1/settings/models/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '公司网关',
        baseUrl: 'https://ai.example.com/v1',
        apiKey: 'sk-e2e-secret-key',
        models: [{ id: 'chat', label: 'Chat', enabled: true }],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      hasApiKey: boolean;
      apiKeyMask: string | null;
    };
    expect(created.hasApiKey).toBe(true);
    expect(created.apiKeyMask).toContain('••••');
    expect(JSON.stringify(created)).not.toContain('sk-e2e-secret-key');

    const disk = readFileSync(join(providersDir, 'providers.json'), 'utf-8');
    expect(disk).not.toContain('sk-e2e-secret-key');
    expect(disk).toContain('公司网关');

    const getRes = await app.request(`/api/v1/settings/models/providers/${created.id}`);
    expect(getRes.status).toBe(200);
    const got = (await getRes.json()) as { apiKeyMask: string };
    expect(JSON.stringify(got)).not.toContain('sk-e2e-secret-key');

    const delRes = await app.request(`/api/v1/settings/models/providers/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
  });

  it('rejects private baseUrl', async () => {
    const res = await app.request('/api/v1/settings/models/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'local',
        baseUrl: 'http://127.0.0.1:8080/v1',
        apiKey: 'x',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('PATCH session modelRef', async () => {
    const createProv = await app.request('/api/v1/settings/models/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'M3',
        baseUrl: 'https://ai.example.com/v1',
        apiKey: 'sk-m3',
        models: [{ id: 'chat', label: 'Chat', enabled: true }],
      }),
    });
    const prov = (await createProv.json()) as { id: string };

    const sessionRes = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, mode: 'ask' }),
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as {
      id: string;
      modelRef?: { providerId: string; modelId: string };
    };
    expect(session.id).toBeTruthy();

    const patchRes = await app.request(`/api/v1/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelRef: { providerId: prov.id, modelId: 'chat' },
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      modelRef?: { providerId: string; modelId: string };
    };
    expect(patched.modelRef).toEqual({ providerId: prov.id, modelId: 'chat' });
  });

  it('fetch-models merges and available only lists enabled', async () => {
    const createRes = await app.request('/api/v1/settings/models/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'FetchMe',
        baseUrl: 'https://ai.example.com/v1',
        apiKey: 'sk-fetch',
        models: [{ id: 'local', label: 'Local', enabled: true }],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const fetchRes = await app.request(
      `/api/v1/settings/models/providers/${created.id}/fetch-models`,
      { method: 'POST' },
    );
    expect(fetchRes.status).toBe(200);
    const fetched = (await fetchRes.json()) as {
      added: number;
      provider: { models: Array<{ id: string; enabled: boolean }> };
    };
    expect(fetched.added).toBe(1);
    expect(fetched.provider.models.find((m) => m.id === 'remote-new')?.enabled).toBe(false);

    const avail = await app.request('/api/v1/models/available');
    const body = (await avail.json()) as {
      groups: Array<{ models: Array<{ id: string }> }>;
    };
    const ids = body.groups.flatMap((g) => g.models.map((m) => m.id));
    expect(ids).toContain('local');
    expect(ids).not.toContain('remote-new');
  });
});
