#!/usr/bin/env node
/**
 * 稳定启动 harness Web 开发栈（显式编排，非 turbo 全并行碰运气）。
 *
 *   pnpm run dev:web           → Pi（需 API Key / 模型设置）
 *   pnpm run dev:web -- --mock → Mock
 *   pnpm run dev:web:mock      → 同上
 *
 * 顺序：build packages → 端口探测 → API 就绪(/health) → tsc watch + Vite
 * API 以 **detached + CIRO_DAEMON_AUTO_STOP** 拉起，并用心跳租约登记 presence：
 * Web/TUI 任一仍在线则保留 daemon；最后一个客户端 goodbye（或失联 TTL）后自动退出。
 *
 * 可选环境变量：
 *   CIRO_WORKSPACE  覆盖 -w（默认 ciro 仓库根）
 *   CIRO_PORT       API 端口（默认 5280；勿用 3080，易落在 Win Hyper-V 排除段）
 *   CIRO_SKIP_BUILD=1  跳过启动前 build（已确认 dist 新鲜时）
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearDaemonRegistry,
  daemonBaseUrl,
  findHealthyDaemon,
  isPidAlive,
} from '../packages/harness-core/dist/daemon/registry.js';
import { wrapSpawnWithHiddenConsole } from '../packages/harness-core/dist/sandbox/win32-hidden-console.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mock = process.argv.includes('--mock');
const backend = mock ? 'mock' : 'pi';
const port = Number(process.env.CIRO_PORT || 5280);
const host = '127.0.0.1';
const workspace = resolve(process.env.CIRO_WORKSPACE || root);
const skipBuild = process.env.CIRO_SKIP_BUILD === '1';
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const isWin = process.platform === 'win32';
const childEnv = {
  ...process.env,
  CIRO_AGENT_BACKEND: backend,
  CIRO_PORT: String(port),
  CIRO_WORKSPACE: workspace,
  CIRO_HOST: host,
};

const packageFilters = [
  '--filter=@ciro-code/harness-shared',
  '--filter=@ciro-code/harness-core',
  '--filter=@ciro-code/harness-pi',
  '--filter=@ciro-code/harness-web',
  '--filter=@ciro-code/cli',
];

const watchFilters = [
  ...packageFilters.filter((f) => f !== '--filter=@ciro-code/cli'),
];

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
/** API 基址（presence leave 用）；不进 killTree */
let apiBaseUrl = '';
const daemonClientId = `dev-web-${process.pid}`;
let shuttingDown = false;
/** @type {ReturnType<typeof setInterval> | undefined} */
let presenceBeat;

function log(msg) {
  console.log(`[dev:web] ${msg}`);
}

function spawnInherit(command, args, opts = {}) {
  const { env: envOverride, shell = isWin, ...rest } = opts;
  const child = spawn(command, args, {
    cwd: root,
    env: envOverride ?? childEnv,
    stdio: 'inherit',
    shell,
    ...rest,
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      log(`${command} exited by signal ${signal}`);
      shutdown(1);
      return;
    }
    if (code !== 0 && code != null) {
      log(`${command} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

/**
 * Detached daemon：关 Web 栈时不杀进程；靠 presence AUTO_STOP，
 * 以便 TUI 仍连着时后端继续活着。
 */
async function spawnDetachedApi(apiArgs) {
  const baseEnv = {
    ...childEnv,
    CIRO_DAEMON_AUTO_STOP: '1',
  };
  const wrapped = await wrapSpawnWithHiddenConsole(process.execPath, apiArgs, baseEnv);
  if (wrapped.wrapped) {
    log('API via Windows hidden-console host (suppress cmd flash from tool children)');
  }
  const child = spawn(wrapped.command, wrapped.args, {
    cwd: root,
    env: wrapped.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    log(
      `API exited unexpectedly${signal ? ` signal=${signal}` : ` code=${code}`}`,
    );
    shutdown(typeof code === 'number' ? code : 1);
  });
  child.unref();
  return child;
}

function runOnce(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: childEnv,
      stdio: 'inherit',
      shell: isWin,
    });
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} killed by ${signal}`));
      else if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function assertPortFree(listenPort) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${listenPort} already in use. Stop the other process or set CIRO_PORT.`,
          ),
        );
      } else if (err.code === 'EACCES') {
        reject(
          new Error(
            `Port ${listenPort} not permitted (Windows excluded range / Hyper-V). Set CIRO_PORT to a free port outside netsh excludedportrange.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolvePromise());
    });
    server.listen(listenPort, host);
  });
}

async function waitForHealth(url, { timeoutMs = 60_000, intervalMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return body;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`API not ready within ${timeoutMs}ms (${lastErr})`);
}

async function touchDaemonClient(baseUrl) {
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/daemon/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: daemonClientId }),
    });
  } catch {
    /* ignore */
  }
}

async function leaveDaemonClient(baseUrl) {
  if (!baseUrl) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    await fetch(
      `${baseUrl.replace(/\/$/, '')}/api/v1/daemon/clients/${encodeURIComponent(daemonClientId)}`,
      { method: 'DELETE', signal: ac.signal },
    );
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer);
  }
}

/** 收口本栈残留的浏览器租约，避免关 Vite 后还要等 30s stale */
async function purgeDaemonClients(baseUrl, prefix) {
  if (!baseUrl || !prefix) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/daemon/clients/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix }),
      signal: ac.signal,
    });
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer);
  }
}

function killTree(child) {
  if (!child.pid || child.exitCode != null) return;
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

/** 开发态：core/web/cli dist 新于 daemon 启动时间 → 旧进程仍跑旧代码（如 PowerShell 选目录） */
function latestRelevantDistMtimeMs() {
  const files = [
    join(root, 'packages', 'harness-core', 'dist', 'workspace', 'pick-directory.js'),
    join(root, 'packages', 'harness-core', 'dist', 'workspace', 'pick-win32-common.js'),
    join(root, 'packages', 'harness-core', 'dist', 'mcp', 'mcp-manager.js'),
    join(root, 'packages', 'harness-web', 'dist', 'index.js'),
    join(root, 'packages', 'harness-web', 'dist', 'app-context.js'),
    join(root, 'packages', 'harness-web', 'dist', 'routes', 'mcp.js'),
    join(root, 'apps', 'ciro-cli', 'dist', 'cli.js'),
  ];
  let max = 0;
  for (const f of files) {
    try {
      max = Math.max(max, statSync(f).mtimeMs);
    } catch {
      /* missing ok */
    }
  }
  return max;
}

function stopStaleDaemon(entry) {
  if (entry.pid && isPidAlive(entry.pid)) {
    log(`stopping stale daemon pid=${entry.pid}`);
    if (isWin) {
      spawn('taskkill', ['/pid', String(entry.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      });
    } else {
      try {
        process.kill(entry.pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }
  clearDaemonRegistry(workspace);
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down…');
  if (presenceBeat) clearInterval(presenceBeat);
  // goodbye 自身 + 收口 web-*；若无 TUI 等其它客户端，daemon 在 grace 后 AUTO_STOP
  await leaveDaemonClient(apiBaseUrl);
  await purgeDaemonClients(apiBaseUrl, 'web-');
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), isWin ? 800 : 200).unref?.();
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});

async function main() {
  log(
    `agentBackend=${backend}${mock ? ' (--mock)' : ' (real models)'} workspace=${workspace} port=${port}`,
  );

  if (!skipBuild) {
    log('building packages…');
    await runOnce(pnpmCmd, ['exec', 'turbo', 'run', 'build', ...packageFilters]);
  } else {
    log('skipping build (CIRO_SKIP_BUILD=1)');
  }

  const cliJs = join(root, 'apps', 'ciro-cli', 'dist', 'cli.js');
  let apiHost = host;
  let apiPort = port;

  // 1A：同 workspace 已有健康 daemon（含 TUI 拉起）→ 附着，勿再抢锁
  // 但 dist 新于 daemon 启动时必须重启，否则内存里仍是旧模块（选目录会继续弹 PowerShell）
  let existing = await findHealthyDaemon(workspace);
  if (existing) {
    const distMs = latestRelevantDistMtimeMs();
    if (distMs > 0 && existing.startedAt > 0 && existing.startedAt < distMs) {
      log(
        `daemon pid=${existing.pid} is stale (startedAt=${new Date(existing.startedAt).toISOString()}, dist newer); restarting API…`,
      );
      stopStaleDaemon(existing);
      // 等端口释放
      await new Promise((r) => setTimeout(r, isWin ? 1200 : 400));
      existing = null;
    }
  }

  let health;
  if (existing) {
    const base = daemonBaseUrl(existing);
    apiHost = existing.host === '0.0.0.0' || existing.host === '::' ? '127.0.0.1' : existing.host;
    apiPort = existing.port;
    apiBaseUrl = base;
    log(`reusing existing daemon pid=${existing.pid} at ${base}`);
    if (apiPort !== port) {
      log(
        `Vite will proxy to :${apiPort} (daemon not on default :${port}); CIRO_PORT=${apiPort}`,
      );
    }
    health = await waitForHealth(`${base}/health`);
  } else {
    await assertPortFree(port);
    const apiArgs = [
      cliJs,
      'web',
      '--no-open',
      '-w',
      workspace,
      '-p',
      String(port),
    ];
    if (mock) apiArgs.push('--mock');

    log('starting detached API (AUTO_STOP; shared with TUI)…');
    await spawnDetachedApi(apiArgs);
    apiBaseUrl = `http://${host}:${port}`;

    const healthUrl = `${apiBaseUrl}/health`;
    log(`waiting for ${healthUrl}`);
    health = await waitForHealth(healthUrl);
  }

  await touchDaemonClient(apiBaseUrl);
  presenceBeat = setInterval(() => {
    void touchDaemonClient(apiBaseUrl);
  }, 10_000);
  presenceBeat.unref?.();

  const healthUrl = `http://${apiHost}:${apiPort}/health`;
  log(
    `API ready (backend=${health.agentBackend ?? backend}, version=${health.version ?? '?'})`,
  );

  log('starting package watchers + Vite…');
  spawnInherit(pnpmCmd, ['exec', 'turbo', 'run', 'dev', ...watchFilters], {
    env: { ...childEnv, CIRO_PORT: String(apiPort) },
  });

  log(`UI will be at http://127.0.0.1:5273  (API ${healthUrl})`);
}

main().catch((err) => {
  console.error(`[dev:web] ${err instanceof Error ? err.message : err}`);
  shutdown(1);
});
