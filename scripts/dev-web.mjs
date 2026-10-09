#!/usr/bin/env node
/**
 * 稳定启动 harness Web 开发栈（显式编排，非 turbo 全并行碰运气）。
 *
 *   pnpm run dev:web           → Pi（需 API Key / 模型设置）
 *   pnpm run dev:web -- --mock → Mock
 *   pnpm run dev:web:mock      → 同上
 *
 * 顺序：build packages → 端口探测 → API 就绪(/health) → tsc watch + Vite
 * API 默认不随 dist 热重启；改完后端 Ctrl+C 再跑一次，或另开 `dev:api:watch`。
 *
 * 可选环境变量：
 *   CIRO_WORKSPACE  覆盖 -w（默认 ciro 仓库根）
 *   CIRO_PORT       API 端口（默认 3080）
 *   CIRO_SKIP_BUILD=1  跳过启动前 build（已确认 dist 新鲜时）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mock = process.argv.includes('--mock');
const backend = mock ? 'mock' : 'pi';
const port = Number(process.env.CIRO_PORT || 3080);
const host = '127.0.0.1';
const workspace = resolve(process.env.CIRO_WORKSPACE || root);
const skipBuild = process.env.CIRO_SKIP_BUILD === '1';
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const isWin = process.platform === 'win32';

const packageFilters = [
  '--filter=@ciro/harness-shared',
  '--filter=@ciro/harness-core',
  '--filter=@ciro/harness-pi',
  '--filter=@ciro/harness-web',
  '--filter=@ciro/cli',
];

const watchFilters = [
  ...packageFilters.filter((f) => f !== '--filter=@ciro/cli'),
];

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(`[dev:web] ${msg}`);
}

function spawnInherit(command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, CIRO_AGENT_BACKEND: backend },
    stdio: 'inherit',
    shell: isWin,
    ...opts,
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

function runOnce(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, CIRO_AGENT_BACKEND: backend },
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

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down…');
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code), isWin ? 800 : 200).unref?.();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

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

  await assertPortFree(port);

  const apiArgs = [
    '--filter',
    '@ciro/cli',
    'exec',
    '--',
    'tsx',
    'src/cli.ts',
    'web',
    '--no-open',
    '-w',
    workspace,
    '-p',
    String(port),
  ];
  if (mock) apiArgs.push('--mock');

  log('starting API…');
  spawnInherit(pnpmCmd, apiArgs);

  const healthUrl = `http://${host}:${port}/health`;
  log(`waiting for ${healthUrl}`);
  const health = await waitForHealth(healthUrl);
  log(
    `API ready (backend=${health.agentBackend ?? backend}, version=${health.version ?? '?'})`,
  );

  log('starting package watchers + Vite…');
  spawnInherit(pnpmCmd, ['exec', 'turbo', 'run', 'dev', ...watchFilters]);

  log(`UI will be at http://127.0.0.1:5273  (API ${healthUrl})`);
}

main().catch((err) => {
  console.error(`[dev:web] ${err instanceof Error ? err.message : err}`);
  shutdown(1);
});
