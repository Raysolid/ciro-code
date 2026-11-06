import { createServer, type Server } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DebugSessionInfo } from '@ciro-code/harness-shared';
import { debugDir } from '../paths/product-paths.js';

export interface DebugIngestHandle {
  debugSessionId: string;
  ingestToken: string;
  ingestUrl: string;
  /** absolute log path */
  logPath: string;
  /** workspace-relative, e.g. .ciro/debug/debug-abc123.log */
  logPathRel: string;
  port: number;
  close: () => Promise<void>;
}

export interface StartDebugIngestOptions {
  workspace: string;
  /** short id suffix; default random 6 hex */
  sessionShortId?: string;
  host?: string;
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** loopback ephemeral ingest：POST /ingest/:token → 追加 NDJSON 到 logPath */
export async function startDebugIngestServer(
  opts: StartDebugIngestOptions,
): Promise<DebugIngestHandle> {
  const host = opts.host ?? '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new Error(`Debug ingest must bind to loopback only (got ${host})`);
  }
  const debugSessionId = opts.sessionShortId ?? shortId();
  const ingestToken = randomUUID();
  const logPathRel = join('.ciro', 'debug', `debug-${debugSessionId}.log`).replace(/\\/g, '/');
  const logPath = join(debugDir(opts.workspace), `debug-${debugSessionId}.log`);
  mkdirSync(dirname(logPath), { recursive: true });

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`);
    const match = url.pathname.match(/^\/ingest\/([^/]+)\/?$/);
    if (req.method === 'POST' && match) {
      const token = match[1];
      if (token !== ingestToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      try {
        const raw = await readBody(req);
        const line = raw.trim().length > 0 ? raw.trim() : '{}';
        // 单行 NDJSON；若 body 已是多行则逐行写入
        const lines = line.split('\n').filter((l) => l.trim());
        mkdirSync(dirname(logPath), { recursive: true });
        for (const l of lines) {
          appendFileSync(logPath, l.endsWith('\n') ? l : `${l}\n`, 'utf-8');
        }
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, debugSessionId }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to bind debug ingest server');
  }
  const port = addr.port;
  const ingestUrl = `http://${host}:${port}/ingest/${ingestToken}`;

  return {
    debugSessionId,
    ingestToken,
    ingestUrl,
    logPath,
    logPathRel,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function stoppedDebugInfoFromPointer(
  workspace: string,
  ptr: { debugSessionId: string; logPathRel: string },
): DebugSessionInfo {
  return {
    debugSessionId: ptr.debugSessionId,
    ingestUrl: '',
    logPath: join(workspace, ptr.logPathRel),
    logPathRel: ptr.logPathRel,
    status: 'stopped',
    ingestRunning: false,
  };
}

export function clearDebugLog(logPath: string): void {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, '', 'utf-8');
}

export function countDebugLogLines(logPath: string): number {
  if (!existsSync(logPath)) return 0;
  const text = readFileSync(logPath, 'utf-8');
  return text.split('\n').filter((l) => l.trim()).length;
}

export function readDebugLogTail(logPath: string, maxLines = 200): string[] {
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim());
  return lines.slice(-maxLines);
}
