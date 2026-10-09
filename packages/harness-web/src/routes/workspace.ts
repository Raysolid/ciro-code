import type { Hono } from 'hono';
import { basename } from 'node:path';
import {
  pickDirectoryDialog,
  readRecentWorkspaces,
  removeRecentWorkspace,
} from '@ciro/harness-core';
import { sameWorkspacePath, type AppContext } from '../app-context.js';

export function registerWorkspaceRoutes(app: Hono, ctx: AppContext): void {
  const { config, setWorkspace, getWorkspaceSelected, setWorkspaceSelected } = ctx;

  app.get('/api/v1/workspace', (c) => {
    return c.json({
      workspace: config.workspace,
      name: basename(config.workspace),
      recent: readRecentWorkspaces(),
      selected: getWorkspaceSelected(),
    });
  });

  app.put('/api/v1/workspace', async (c) => {
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    if (!body.path?.trim()) {
      return c.json({ error: 'path is required' }, 400);
    }
    try {
      return c.json(setWorkspace(body.path.trim()));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  app.delete('/api/v1/workspace/recent', async (c) => {
    const body = (await c.req.json<{ path?: string }>().catch(() => ({}))) as {
      path?: string;
    };
    if (!body.path?.trim()) {
      return c.json({ error: 'path is required' }, 400);
    }
    const recent = removeRecentWorkspace(body.path.trim());
    const removedCurrent = sameWorkspacePath(body.path.trim(), config.workspace);
    if (removedCurrent) {
      setWorkspaceSelected(false);
    }
    return c.json({
      workspace: config.workspace,
      name: basename(config.workspace),
      recent,
      selected: getWorkspaceSelected(),
    });
  });

  app.post('/api/v1/workspace/pick', async (c) => {
    try {
      const picked = await pickDirectoryDialog(
        getWorkspaceSelected() ? config.workspace : undefined,
      );
      if (!picked) {
        return c.json({ cancelled: true });
      }
      return c.json({ ...setWorkspace(picked), cancelled: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[workspace/pick]', message);
      return c.json({ error: message }, 500);
    }
  });
}
