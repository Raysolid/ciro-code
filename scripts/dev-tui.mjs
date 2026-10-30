#!/usr/bin/env node
/**
 * 开发态启动全屏 TUI（对齐 dev:web 的编排习惯）。
 *
 *   pnpm run dev:tui              → Pi（需 API Key）
 *   pnpm run dev:tui -- --mock    → Mock
 *   pnpm run dev:tui:mock         → 同上
 *
 * 顺序：build 依赖包 → tsx 跑 ciro-cli `tui`（stdio inherit，保留 TTY）
 *
 * 可选环境变量：
 *   CIRO_WORKSPACE     覆盖 -w（默认 ciro 仓库根）
 *   CIRO_SKIP_BUILD=1  跳过启动前 build
 *   CIRO_AGENT_BACKEND=mock  与 --mock 等价
 *
 * 额外参数原样转给 `ciro tui`，例如：
 *   pnpm run dev:tui:mock -- --mode=agent -w D:\proj
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const mock =
  argv.includes('--mock') || process.env.CIRO_AGENT_BACKEND === 'mock';
const backend = mock ? 'mock' : 'pi';
const workspace = resolve(process.env.CIRO_WORKSPACE || root);
const skipBuild = process.env.CIRO_SKIP_BUILD === '1';
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const isWin = process.platform === 'win32';

/** 转发给 `ciro tui` 的参数（去掉本脚本消费的 --mock） */
const passthrough = argv.filter((a) => a !== '--mock');

const packageFilters = [
  '--filter=@ciro-code/harness-shared',
  '--filter=@ciro-code/harness-core',
  '--filter=@ciro-code/harness-pi',
  '--filter=@ciro-code/harness-timeline',
  '--filter=@ciro-code/harness-tui',
  '--filter=@ciro-code/profile-cursor-modes',
  '--filter=@ciro-code/cli',
];

function log(msg) {
  console.log(`[dev:tui] ${msg}`);
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

function runTui() {
  return new Promise((resolvePromise) => {
    const args = [
      '--filter',
      '@ciro-code/cli',
      'exec',
      '--',
      'tsx',
      'src/cli.ts',
      'tui',
      '-w',
      workspace,
      ...passthrough,
    ];
    if (mock && !passthrough.includes('--mock')) {
      args.push('--mock');
    }

    log(`starting TUI (agentBackend=${backend}, workspace=${workspace})`);
    const child = spawn(pnpmCmd, args, {
      cwd: root,
      env: { ...process.env, CIRO_AGENT_BACKEND: backend },
      // 必须 inherit：alternate screen / raw mode 依赖真实 TTY
      stdio: 'inherit',
      shell: isWin,
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        log(`TUI exited by signal ${signal}`);
        resolvePromise(1);
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

async function main() {
  if (!skipBuild) {
    log('building packages…');
    await runOnce(pnpmCmd, ['exec', 'turbo', 'run', 'build', ...packageFilters]);
  } else {
    log('skipping build (CIRO_SKIP_BUILD=1)');
  }

  const code = await runTui();
  process.exit(code);
}

main().catch((err) => {
  console.error(`[dev:tui] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
