import type { Hono } from 'hono';
import type { AppContext } from '../app-context.js';

export function registerExtensionRoutes(app: Hono, ctx: AppContext): void {
  const { extensionHost } = ctx;

  app.get('/api/v1/extensions', async (c) => {
    await extensionHost.ensureLoaded();
    return c.json(extensionHost.list());
  });

  app.post('/api/v1/extensions/reload', async (c) => {
    await extensionHost.reloadTrusted();
    return c.json(extensionHost.list());
  });

  app.post('/api/v1/extensions/:id/trust', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      return c.json(await extensionHost.trust(id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(msg) ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post('/api/v1/extensions/:id/untrust', (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      return c.json(extensionHost.untrust(id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = /not found/i.test(msg) ? 404 : 400;
      return c.json({ error: msg }, status);
    }
  });
}
