#!/usr/bin/env node
/**
 * 发布前审计：npm pack --dry-run，拦截 source map / 密钥 / 测试产物。
 *
 *   node ./scripts/audit-npm-pack.mjs
 *   node ./scripts/audit-npm-pack.mjs apps/ciro-cli
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BLOCK = [
  { re: /\.map$/i, label: 'source map' },
  { re: /(^|\/)\.env(\.|$)/i, label: 'env file' },
  { re: /\.(pem|key)$/i, label: 'private key/cert' },
  { re: /(^|\/)(secrets?|credentials)(\.|\/|$)/i, label: 'secrets path' },
  { re: /\.tsbuildinfo$/i, label: 'tsbuildinfo' },
  { re: /\.(e2e\.)?test\.(js|d\.ts)$/i, label: 'test artifact' },
];

function listPublicPackages() {
  const out = [];
  for (const dir of ['apps', 'packages']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const pkgPath = join(base, name, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.publishConfig?.access === 'public') out.push(join(base, name));
    }
  }
  return out;
}

function packList(pkgDir) {
  // 不用 --json：CLI prepack 日志会污染 stdout。
  const r = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: pkgDir,
    encoding: 'utf8',
    shell: true,
  });
  const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (r.status !== 0) throw new Error(`npm pack failed in ${pkgDir}:\n${combined}`);
  return combined
    .split(/\r?\n/)
    .map((l) => l.match(/npm notice\s+[\d.]+\s*[kKmMgG]?B\s+(.+)$/i)?.[1]?.trim())
    .filter(Boolean);
}

function blocked(files) {
  const hits = [];
  for (const file of files) {
    for (const rule of BLOCK) {
      if (rule.re.test(file)) hits.push({ file, label: rule.label });
    }
  }
  return hits;
}

const args = process.argv.slice(2);
const targets = args.length ? args.map((p) => resolve(p)) : listPublicPackages();

let failed = false;
for (const pkgDir of targets) {
  const rel = relative(root, pkgDir) || '.';
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    const files = packList(pkgDir);
    const hits = blocked(files);
    if (hits.length) {
      failed = true;
      console.error(`❌ ${pkg.name} (${rel}): ${hits.length} blocked file(s)`);
      for (const h of hits) console.error(`   - [${h.label}] ${h.file}`);
    } else {
      console.log(`✅ ${pkg.name} (${rel}): ${files.length} files, audit passed`);
    }
  } catch (e) {
    failed = true;
    console.error(`❌ ${rel}: ${e instanceof Error ? e.message : e}`);
  }
}

if (failed) process.exit(1);
