import type { Hono } from 'hono';
import type { AppContext } from '../app-context.js';

export function registerPackRoutes(app: Hono, ctx: AppContext): void {
  const { packStore } = ctx;

  app.get('/api/v1/packs', (c) => {
    return c.json(packStore.list());
  });

  app.post('/api/v1/packs/reload', (c) => {
    return c.json(packStore.reload());
  });

  app.post('/api/v1/packs/:id/enable', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      const item = packStore.setEnabled(id, true);
      return c.json(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not installed') || msg.includes('not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post('/api/v1/packs/:id/disable', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      const item = packStore.setEnabled(id, false);
      return c.json(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('not installed') || msg.includes('not found') ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });
}
