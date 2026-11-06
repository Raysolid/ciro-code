import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderStore } from './provider-store.js';
import { validateProviderBaseUrl } from './validate-provider-url.js';
import { testProviderConnectivity } from './test-provider.js';
import { mergeFetchedModels, parseOpenAiModelsPayload } from './fetch-models.js';

describe('validateProviderBaseUrl', () => {
  it('accepts public https base without trailing slash', () => {
    const r = validateProviderBaseUrl('https://api.deepseek.com/v1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe('https://api.deepseek.com/v1');
  });

  it('rejects trailing slash on path', () => {
    const r = validateProviderBaseUrl('https://api.deepseek.com/v1/');
    expect(r.ok).toBe(false);
  });

  it('rejects localhost and private IPs', () => {
    expect(validateProviderBaseUrl('http://localhost:8080/v1').ok).toBe(false);
    expect(validateProviderBaseUrl('http://127.0.0.1/v1').ok).toBe(false);
    expect(validateProviderBaseUrl('http://10.0.0.1/v1').ok).toBe(false);
    expect(validateProviderBaseUrl('http://192.168.1.1/v1').ok).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(validateProviderBaseUrl('ftp://example.com/v1').ok).toBe(false);
  });
});

describe('mergeFetchedModels', () => {
  it('keeps local enabled and adds remote as disabled', () => {
    const { models, added } = mergeFetchedModels(
      [{ id: 'a', label: 'A', enabled: true }],
      [
        { id: 'a', label: 'A remote' },
        { id: 'b', label: 'B' },
      ],
    );
    expect(added).toBe(1);
    expect(models.find((m) => m.id === 'a')?.enabled).toBe(true);
    expect(models.find((m) => m.id === 'a')?.label).toBe('A');
    expect(models.find((m) => m.id === 'b')).toEqual({
      id: 'b',
      label: 'B',
      enabled: false,
    });
  });

  it('parses OpenAI models payload', () => {
    const models = parseOpenAiModelsPayload({
      data: [{ id: 'deepseek-chat' }, { id: '  ' }, { foo: 1 }],
    });
    expect(models).toEqual([{ id: 'deepseek-chat', label: 'deepseek-chat' }]);
  });

  it('parses apiMaxContext from known fields', () => {
    const models = parseOpenAiModelsPayload({
      data: [
        { id: 'a', context_length: 200000 },
        { id: 'b', context_window: 128000 },
        { id: 'c', max_model_len: 65536 },
        { id: 'd' },
      ],
    });
    expect(models.find((m) => m.id === 'a')?.apiMaxContext).toBe(200000);
    expect(models.find((m) => m.id === 'b')?.apiMaxContext).toBe(128000);
    expect(models.find((m) => m.id === 'c')?.apiMaxContext).toBe(65536);
    expect(models.find((m) => m.id === 'd')?.apiMaxContext).toBeUndefined();
  });

  it('merge updates apiMaxContext from remote and clears when absent', () => {
    const { models } = mergeFetchedModels(
      [{ id: 'a', label: 'A', enabled: true, apiMaxContext: 1000 }],
      [{ id: 'a', label: 'A' }],
    );
    expect(models.find((m) => m.id === 'a')?.apiMaxContext).toBeUndefined();

    const { models: m2 } = mergeFetchedModels(
      [{ id: 'a', label: 'A', enabled: true }],
      [{ id: 'a', label: 'A', apiMaxContext: 200000 }],
    );
    expect(m2.find((m) => m.id === 'a')?.apiMaxContext).toBe(200000);
  });
});

describe('ProviderStore', () => {
  it('CRUD with masked GET and no plaintext key on disk in providers.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-prov-'));
    const store = new ProviderStore({
      providersPath: join(dir, 'providers.json'),
      keysPath: join(dir, 'credentials', 'provider-keys.json'),
    });

    const created = store.create({
      name: '公司网关',
      baseUrl: 'https://ai.example.com/v1',
      apiKey: 'sk-secret-abcdef',
      models: [{ id: 'm1', label: 'Model One', enabled: true }],
    });

    expect(created.id.startsWith('prov_')).toBe(true);
    expect(created.hasApiKey).toBe(true);
    expect(created.apiKeyMask).toBe('••••cdef');
    expect(JSON.stringify(created)).not.toContain('sk-secret-abcdef');

    const list = store.listMasked();
    expect(list.providers).toHaveLength(1);
    expect(list.providers[0]?.apiKeyMask).toBe('••••cdef');
    expect(JSON.stringify(list)).not.toContain('sk-secret-abcdef');
    expect(list.defaultModelRef).toEqual({
      providerId: created.id,
      modelId: 'm1',
    });

    const providersRaw = store.readFile();
    expect(JSON.stringify(providersRaw)).not.toContain('sk-secret');
    expect(store.getApiKey(created.id)).toBe('sk-secret-abcdef');

    const updated = store.update(created.id, { name: 'Gateway', apiKey: 'sk-new-9999' });
    expect(updated.name).toBe('Gateway');
    expect(updated.apiKeyMask).toBe('••••9999');
    expect(store.getApiKey(created.id)).toBe('sk-new-9999');

    expect(store.delete(created.id)).toBe(true);
    expect(store.listMasked().providers).toHaveLength(0);
    expect(store.getApiKey(created.id)).toBeUndefined();
  });

  it('rejects private baseUrl on create', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-prov-bad-'));
    const store = new ProviderStore({
      providersPath: join(dir, 'providers.json'),
      keysPath: join(dir, 'keys.json'),
    });
    expect(() =>
      store.create({ name: 'bad', baseUrl: 'http://127.0.0.1:3000/v1', apiKey: 'x' }),
    ).toThrow(/private|loopback|not allowed/i);
  });

  it('persists across new store instances', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-prov-persist-'));
    const paths = {
      providersPath: join(dir, 'providers.json'),
      keysPath: join(dir, 'keys.json'),
    };
    const a = new ProviderStore(paths);
    const created = a.create({
      name: 'Persist',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-persist-1234',
    });
    const b = new ProviderStore(paths);
    const listed = b.listMasked();
    expect(listed.providers[0]?.id).toBe(created.id);
    expect(b.getApiKey(created.id)).toBe('sk-persist-1234');
  });

  it('fetchModels merges and listAvailable only returns enabled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-prov-fetch-'));
    const store = new ProviderStore({
      providersPath: join(dir, 'providers.json'),
      keysPath: join(dir, 'keys.json'),
    });
    const created = store.create({
      name: 'Gateway',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      models: [{ id: 'keep', label: 'Keep', enabled: true }],
    });

    const result = await store.fetchModels(created.id, {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'keep' }, { id: 'new-model' }],
          }),
          { status: 200 },
        ),
    });

    expect(result.added).toBe(1);
    expect(result.provider.models.find((m) => m.id === 'new-model')?.enabled).toBe(false);
    expect(result.provider.models.find((m) => m.id === 'keep')?.enabled).toBe(true);

    let available = store.listAvailable();
    expect(available.groups).toHaveLength(1);
    expect(available.groups[0]?.models.map((m) => m.id)).toEqual(['keep']);

    store.update(created.id, {
      models: result.provider.models.map((m) =>
        m.id === 'new-model' ? { ...m, enabled: true } : m,
      ),
    });
    available = store.listAvailable();
    expect(available.groups[0]?.models.map((m) => m.id).sort()).toEqual(['keep', 'new-model']);
  });
  it('resolveEffectiveModelRef falls back when preferred disabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-prov-eff-'));
    const store = new ProviderStore({
      providersPath: join(dir, 'providers.json'),
      keysPath: join(dir, 'keys.json'),
    });
    const created = store.create({
      name: 'G',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-x',
      models: [
        { id: 'a', label: 'A', enabled: false },
        { id: 'b', label: 'B', enabled: true },
      ],
    });
    const eff = store.resolveEffectiveModelRef({
      providerId: created.id,
      modelId: 'a',
    });
    expect(eff).toEqual({ providerId: created.id, modelId: 'b' });
  });
});

describe('testProviderConnectivity', () => {
  it('returns ok when fetch succeeds', async () => {
    const result = await testProviderConnectivity(
      {
        baseUrl: 'https://api.example.com/v1',
        fullUrl: false,
        auth: { type: 'bearer' },
      },
      'sk-test',
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ data: [] }), { status: 200 }),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('fails without api key', async () => {
    const result = await testProviderConnectivity(
      {
        baseUrl: 'https://api.example.com/v1',
        fullUrl: false,
        auth: { type: 'bearer' },
      },
      undefined,
    );
    expect(result.ok).toBe(false);
  });
});
