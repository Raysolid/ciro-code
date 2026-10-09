import type { Hono } from 'hono';
import type { AppContext } from '../app-context.js';

export function registerRulesRoutes(app: Hono, ctx: AppContext): void {
  const { services } = ctx;

  app.get('/api/v1/settings/rules', (c) => {
    return c.json({ items: services.ruleRegistry.list() });
  });

  app.get('/api/v1/settings/rules/:id', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const item = services.ruleRegistry.readBody(id);
    if (!item) return c.json({ error: 'Rule not found' }, 404);
    return c.json({
      ...item.meta,
      body: item.body,
    });
  });

  app.put('/api/v1/settings/rules/:id', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const body = await c.req
      .json<{
        body?: string;
        enabled?: boolean;
        description?: string;
        globs?: string[];
      }>()
      .catch(() => ({} as { body?: string; enabled?: boolean; description?: string; globs?: string[] }));
    try {
      if (typeof body.enabled === 'boolean' && body.body === undefined) {
        const meta = services.ruleRegistry.setEnabled(id, body.enabled);
        return c.json(meta);
      }
      const cur = services.ruleRegistry.readBody(id);
      if (!cur) return c.json({ error: 'Rule not found' }, 404);
      const meta = services.ruleRegistry.writeBody(id, body.body ?? cur.body, {
        enabled: body.enabled,
        description: body.description,
        globs: body.globs,
      });
      return c.json(meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post('/api/v1/settings/rules', async (c) => {
    const body = await c.req
      .json<{
        source?: 'project' | 'global';
        name?: string;
        body?: string;
        description?: string;
        globs?: string[];
      }>()
      .catch(() => ({} as Record<string, never>));
    if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
    const source = body.source === 'global' ? 'global' : 'project';
    try {
      const meta = services.ruleRegistry.create({
        source,
        name: body.name.trim(),
        body: body.body,
        description: body.description,
        globs: body.globs,
      });
      return c.json(meta, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });
}
