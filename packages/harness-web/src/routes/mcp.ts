import type { Hono } from 'hono';
import type { McpServerConfig } from '@ciro-code/harness-shared';
import type { AppContext } from '../app-context.js';

export function registerMcpRoutes(app: Hono, ctx: AppContext): void {
  const { services } = ctx;

  app.get('/api/v1/mcp/servers', (c) => {
    return c.json({ items: services.mcpManager.listServers() });
  });

  app.put('/api/v1/mcp/servers', async (c) => {
    const body = await c.req
      .json<{
        mcpServers?: Record<string, McpServerConfig>;
        defaultEnabled?: string[];
      }>()
      .catch(() => ({} as Record<string, never>));
    if (!body.mcpServers || typeof body.mcpServers !== 'object') {
      return c.json({ error: 'mcpServers is required' }, 400);
    }
    try {
      const items = services.mcpManager.upsertServers(body.mcpServers, {
        defaultEnabled: body.defaultEnabled,
      });
      return c.json({ items });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.put('/api/v1/mcp/servers/:id', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const body = await c.req.json<McpServerConfig>().catch(() => null);
    if (!body) return c.json({ error: 'Invalid body' }, 400);
    try {
      const item = services.mcpManager.putServer(id, body);
      return c.json(item);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/v1/mcp/servers/:id', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    try {
      services.mcpManager.removeServer(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.post('/api/v1/mcp/servers/:id/test', async (c) => {
    const id = decodeURIComponent(c.req.param('id'));
    const body = await c.req
      .json<{ keepAlive?: boolean }>()
      .catch(() => ({ keepAlive: false }));
    try {
      const item = await services.mcpManager.testConnection(id, {
        keepAlive: Boolean(body.keepAlive),
      });
      return c.json(item);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/mcp/defaults', (c) => {
    return c.json({ enabled: services.mcpManager.getDefaultEnabled() });
  });

  app.put('/api/v1/mcp/defaults', async (c) => {
    const body = await c.req
      .json<{ enabled?: string[] }>()
      .catch(() => ({} as { enabled?: string[] }));
    if (!Array.isArray(body.enabled)) {
      return c.json({ error: 'enabled must be an array' }, 400);
    }
    return c.json({ enabled: services.mcpManager.setDefaultEnabled(body.enabled) });
  });

  app.get('/api/v1/mcp/sessions/:sessionId/enabled', (c) => {
    const sessionId = c.req.param('sessionId');
    return c.json({ enabled: services.mcpManager.getSessionEnabled(sessionId) });
  });

  app.put('/api/v1/mcp/sessions/:sessionId/enabled', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req
      .json<{ enabled?: string[] }>()
      .catch(() => ({} as { enabled?: string[] }));
    if (!Array.isArray(body.enabled)) {
      return c.json({ error: 'enabled must be an array' }, 400);
    }
    const enabled = services.mcpManager.setSessionEnabled(sessionId, body.enabled);
    return c.json({ enabled });
  });
}
