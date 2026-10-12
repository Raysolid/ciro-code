#!/usr/bin/env node
/**
 * 将闭源构建产物打入 CLI（npm pack / publish 自包含）：
 * - vendor/ui                         ← harness-ui/dist
 * - vendor/profile-cursor-modes/dist  ← profile-cursor-modes/dist（仅运行时 JS）
 *
 *   node ./scripts/bundle-cli-assets.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliVendor = join(root, 'apps', 'ciro-cli', 'vendor');

function mustExist(path, hint) {
  if (!existsSync(path)) {
    console.error(`[bundle-cli-assets] missing ${path}${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
}

/** 递归拷贝；skip(name) 为 true 则跳过该条目（含目录名）。 */
function syncTree(src, dest, skip) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skip(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) syncTree(from, to, skip);
    else cpSync(from, to);
  }
}

const uiDist = join(root, 'packages', 'harness-ui', 'dist');
mustExist(join(uiDist, 'index.html'), 'run: pnpm --filter @ciro-code/harness-ui build');
const uiOut = join(cliVendor, 'ui');
syncTree(uiDist, uiOut, (n) => n.endsWith('.map'));
console.log(`[bundle-cli-assets] ui → ${uiOut}`);

const profileDist = join(root, 'packages', 'profile-cursor-modes', 'dist');
mustExist(join(profileDist, 'src', 'index.js'), 'run: pnpm --filter @ciro-code/profile-cursor-modes build');
const profileOut = join(cliVendor, 'profile-cursor-modes', 'dist');
syncTree(
  profileDist,
  profileOut,
  (n) => n.endsWith('.d.ts') || n.endsWith('.map') || n.endsWith('.tsbuildinfo'),
);
console.log(`[bundle-cli-assets] profile → ${profileOut}`);
