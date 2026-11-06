import type { Hono } from 'hono';
import {
  ensureMemoryEntry,
  listMemoryEntries,
  readMemoryEntry,
  resolveEntryId,
  writeMemoryEntry,
} from '@ciro-code/harness-core';
import type { AppContext } from '../app-context.js';

export function registerMemoryRoutes(app: Hono, ctx: AppContext): void {
  const { services } = ctx;

  app.get('/api/v1/memory', (c) => {
    return c.json({ items: listMemoryEntries(services.memoryStore) });
  });

  app.get('/api/v1/memory/content', (c) => {
    const path = c.req.query('path') ?? c.req.query('id');
    if (!path) return c.json({ error: 'path or id is required' }, 400);
    try {
      const id = resolveEntryId(path);
      if (!id) return c.json({ error: `Unknown memory entry: ${path}` }, 404);
      return c.json({
        id,
        path,
        content: readMemoryEntry(services.memoryStore, id),
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
    }
  });

  app.put('/api/v1/memory', async (c) => {
    const body = await c.req.json<{ path?: string; id?: string; content: string }>();
    const pathOrId = body?.path ?? body?.id;
    if (!pathOrId || body.content == null) {
      return c.json({ error: 'path (or id) and content required' }, 400);
    }
    try {
      writeMemoryEntry(services.memoryStore, pathOrId, body.content);
      return c.json({ ok: true, path: pathOrId });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  /** 空文件时写入默认模板 */
  app.post('/api/v1/memory/ensure', async (c) => {
    const body = await c.req.json<{ path?: string; id?: string }>();
    const pathOrId = body?.path ?? body?.id;
    if (!pathOrId) return c.json({ error: 'path or id required' }, 400);
    try {
      const content = ensureMemoryEntry(services.memoryStore, pathOrId);
      return c.json({ ok: true, path: pathOrId, content });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
