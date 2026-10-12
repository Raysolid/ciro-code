import type { Hono } from 'hono';
import { Readable } from 'node:stream';
import {
  isProductDirKind,
  listDirectoryListing,
  listFileTree,
  openPathExternally,
  openProductLocation,
  openWorkspaceRawStream,
  readWorkspaceFile,
  revealPathInFolder,
  searchWorkspacePaths,
  statWorkspaceFile,
} from '@ciro-code/harness-core';
import type { AppContext } from '../app-context.js';

export function registerFileRoutes(app: Hono, ctx: AppContext): void {
  const { config } = ctx;

  app.get('/api/v1/files/tree', (c) => {
    const path = c.req.query('path') || '.';
    const compact = c.req.query('compact') === '1' || c.req.query('compact') === 'true';
    const depthRaw = c.req.query('maxDepth');
    const maxDepth = depthRaw ? Number(depthRaw) : 1;
    try {
      if (compact) {
        return c.json(listDirectoryListing(config.workspace, path, true));
      }
      return c.json(listFileTree(config.workspace, path, maxDepth));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/files/search', (c) => {
    const q = c.req.query('q') ?? '';
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number(limitRaw) : 20;
    try {
      return c.json({ items: searchWorkspacePaths(config.workspace, q, Number.isFinite(limit) ? limit : 20) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/files/stat', (c) => {
    const path = c.req.query('path');
    if (!path) return c.json({ error: 'path is required' }, 400);
    try {
      return c.json(statWorkspaceFile(config.workspace, path));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/files/content', (c) => {
    const path = c.req.query('path');
    if (!path) return c.json({ error: 'path is required' }, 400);
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined;
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined;
    try {
      return c.json(readWorkspaceFile(config.workspace, path, { offset, limit }));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.get('/api/v1/files/raw', (c) => {
    const path = c.req.query('path');
    if (!path) return c.json({ error: 'path is required' }, 400);
    try {
      const raw = openWorkspaceRawStream(config.workspace, path);
      const webStream = Readable.toWeb(raw.stream) as ReadableStream;
      return new Response(webStream, {
        headers: {
          'Content-Type': raw.mime,
          'Content-Length': String(raw.size),
          'Cache-Control': 'private, max-age=60',
        },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/files/open', async (c) => {
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    if (!body.path?.trim()) return c.json({ error: 'path is required' }, 400);
    try {
      await openPathExternally(config.workspace, body.path.trim());
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/product-dirs/open', async (c) => {
    const body = (await c.req.json<{ kind?: string }>().catch(() => ({}))) as {
      kind?: string;
    };
    const kind = body.kind?.trim() ?? '';
    if (!isProductDirKind(kind)) {
      return c.json({ error: 'kind is required' }, 400);
    }
    try {
      await openProductLocation(config.workspace, kind);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.post('/api/v1/files/reveal', async (c) => {
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    if (!body.path?.trim()) return c.json({ error: 'path is required' }, 400);
    try {
      await revealPathInFolder(config.workspace, body.path.trim());
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });
}
