import type { Hono } from 'hono';
import type { CreateProviderRequest, ModelRef, UpdateProviderRequest } from '@ciro-code/harness-shared';
import { testProviderConnectivity } from '@ciro-code/harness-core';
import type { AppContext } from '../app-context.js';

export function registerProviderRoutes(app: Hono, ctx: AppContext): void {
  const { providerStore } = ctx;

  app.get('/api/v1/settings/models/providers', (c) => {
    return c.json(providerStore.listMasked());
  });

  app.post('/api/v1/settings/models/providers/import-from-env', (c) => {
    try {
      const created = providerStore.importFromEnv();
      if (!created) {
        return c.json({ error: 'No env API key to import' }, 400);
      }
      return c.json(created, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/settings/models/providers', async (c) => {
    const body = (await c.req.json<CreateProviderRequest>().catch(() => null)) as CreateProviderRequest | null;
    if (!body?.name) {
      return c.json({ error: 'name is required' }, 400);
    }
    if (!body.baseUrl && !body.template) {
      return c.json({ error: 'baseUrl or template is required' }, 400);
    }
    try {
      const created = providerStore.create({
        ...body,
        baseUrl: body.baseUrl ?? '',
      });
      return c.json(created, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/settings/models/providers/:id', (c) => {
    const id = c.req.param('id');
    const found = providerStore.getMasked(id);
    if (!found) return c.json({ error: 'Provider not found' }, 404);
    return c.json(found);
  });

  app.put('/api/v1/settings/models/providers/:id', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json<UpdateProviderRequest>().catch(() => ({}))) as UpdateProviderRequest;
    try {
      const updated = providerStore.update(id, body);
      return c.json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.delete('/api/v1/settings/models/providers/:id', (c) => {
    const id = c.req.param('id');
    if (!providerStore.delete(id)) {
      return c.json({ error: 'Provider not found' }, 404);
    }
    return c.json({ ok: true });
  });

  app.post('/api/v1/settings/models/providers/:id/test', async (c) => {
    const id = c.req.param('id');
    const found = providerStore.getMasked(id);
    if (!found) return c.json({ error: 'Provider not found' }, 404);
    const apiKey = providerStore.getApiKey(id);
    const result = await testProviderConnectivity(found, apiKey);
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/v1/settings/models/providers/:id/fetch-models', async (c) => {
    const id = c.req.param('id');
    try {
      const result = await providerStore.fetchModels(id);
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.get('/api/v1/models/available', (c) => {
    return c.json(providerStore.listAvailable());
  });

  app.put('/api/v1/settings/models/default', async (c) => {
    const body = (await c.req.json<{ modelRef?: ModelRef | null }>().catch(() => ({}))) as {
      modelRef?: ModelRef | null;
    };
    try {
      providerStore.setDefaultModelRef(body.modelRef ?? null);
      return c.json({ defaultModelRef: body.modelRef ?? null });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
