#!/usr/bin/env node
/**
 * 过滤导出开源面 → 目标目录（默认 ../ciro-code）。
 * 排除 harness-ui、profile-cursor-modes、ext-smoke；导出后 CLI 改用 minimal stub。
 *
 *   node ./scripts/export-opensource.mjs
 *   node ./scripts/export-opensource.mjs --out D:\workspace\ciro-code
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.find((_, i, a) => a[i - 1] === '--out');
const outRoot = resolve(outArg ?? join(root, '..', 'ciro-code'));

const EXCLUDE_PACKAGES = new Set([
  'harness-ui',
  'profile-cursor-modes',
  'ext-smoke',
]);

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.ciro',
  '.pi',
  '.git',
]);

const ROOT_FILES = [
  'package.json',
  'pnpm-workspace.yaml',
  // lockfile 含闭源包；导出后由 pnpm install 重新生成
  'tsconfig.base.json',
  'turbo.json',
  '.gitignore',
];

function log(msg) {
  console.log(`[export-opensource] ${msg}`);
}

function shouldSkipPath(name) {
  return (
    SKIP_DIR_NAMES.has(name) ||
    name.endsWith('.tsbuildinfo') ||
    name.startsWith('.tmp-')
  );
}

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (shouldSkipPath(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = statSync(from);
    if (st.isDirectory()) copyTree(from, to);
    else cpSync(from, to);
  }
}

function writePublicReadme(dest) {
  const fromDocs = join(root, 'docs', 'opensource-README.md');
  if (existsSync(fromDocs)) {
    cpSync(fromDocs, join(dest, 'README.md'));
    return;
  }
  writeFileSync(
    join(dest, 'README.md'),
    '# Ciro Code\n\nOpen-core harness kernel. See docs/opensource-README.md in the private workspace.\n',
    'utf8',
  );
}

function writeLicense(dest) {
  writeFileSync(
    join(dest, 'LICENSE'),
    `MIT License

Copyright (c) 2026 Ciro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
    'utf8',
  );
}

function patchCliForStub(dest) {
  const pkgPath = join(dest, 'apps', 'ciro-cli', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.dependencies?.['@ciro/profile-cursor-modes']) {
    delete pkg.dependencies['@ciro/profile-cursor-modes'];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  const tsconfigPath = join(dest, 'apps', 'ciro-cli', 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    if (Array.isArray(tsconfig.references)) {
      tsconfig.references = tsconfig.references.filter(
        (r) => !String(r.path ?? '').includes('profile-cursor-modes'),
      );
      writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, 'utf8');
    }
  }

  const cliPath = join(dest, 'apps', 'ciro-cli', 'src', 'cli.ts');
  let cli = readFileSync(cliPath, 'utf8');
  cli = cli.replace(
    /import \{ HARNESS_VERSION \} from '@ciro\/harness-shared';\r?\nimport \{ createCursorModeProfileProvider \} from '@ciro\/profile-cursor-modes';/,
    `import { HARNESS_VERSION, createMinimalModeProfiles } from '@ciro/harness-shared';`,
  );
  cli = cli.replace(
    /modeProfiles:\s*createCursorModeProfileProvider\(\),/,
    'modeProfiles: createMinimalModeProfiles(),',
  );
  if (cli.includes('profile-cursor-modes') || cli.includes('createCursorModeProfileProvider')) {
    throw new Error('CLI patch incomplete: still references profile-cursor-modes');
  }
  writeFileSync(cliPath, cli, 'utf8');
}

function patchRootPackage(dest) {
  const pkgPath = join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = 'ciro-code';
  pkg.description =
    'Ciro Code open-core harness kernel (no proprietary UI / four-mode Profile source)';
  // 公开树无 harness-ui：dev:web 依赖闭源 UI，改为文档中的 mock CLI
  pkg.scripts = {
    ...pkg.scripts,
    'dev:web':
      'pnpm run build && pnpm --filter @ciro/cli exec node dist/cli.js web --no-open',
    'dev:web:mock':
      'pnpm run build && pnpm --filter @ciro/cli exec node dist/cli.js web --mock --no-open',
  };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function patchDevWebScript(dest) {
  const scriptPath = join(dest, 'scripts', 'dev-web.mjs');
  if (!existsSync(scriptPath)) return;
  // 公开树仍保留脚本，但去掉 harness-ui watch（源码不在仓内）
  let src = readFileSync(scriptPath, 'utf8');
  src = src.replace(
    /const watchFilters = \[[\s\S]*?\];/,
    `const watchFilters = [
  ...packageFilters.filter((f) => f !== '--filter=@ciro/cli'),
];`,
  );
  writeFileSync(scriptPath, src, 'utf8');
}

function assertNoClosedSource(dest) {
  for (const name of EXCLUDE_PACKAGES) {
    const p = join(dest, 'packages', name);
    if (existsSync(p)) {
      throw new Error(`Closed package leaked into export: ${p}`);
    }
  }
}

// --- main ---
if (existsSync(outRoot)) {
  log(`removing existing ${outRoot}`);
  rmSync(outRoot, { recursive: true, force: true });
}
mkdirSync(outRoot, { recursive: true });

for (const file of ROOT_FILES) {
  const from = join(root, file);
  if (existsSync(from)) cpSync(from, join(outRoot, file));
}

copyTree(join(root, 'apps'), join(outRoot, 'apps'));
copyTree(join(root, 'examples'), join(outRoot, 'examples'));
if (existsSync(join(root, 'profiles'))) {
  copyTree(join(root, 'profiles'), join(outRoot, 'profiles'));
}
if (existsSync(join(root, 'scripts'))) {
  copyTree(join(root, 'scripts'), join(outRoot, 'scripts'));
}
if (existsSync(join(root, 'docs'))) {
  copyTree(join(root, 'docs'), join(outRoot, 'docs'));
}

mkdirSync(join(outRoot, 'packages'), { recursive: true });
for (const name of readdirSync(join(root, 'packages'))) {
  if (EXCLUDE_PACKAGES.has(name) || shouldSkipPath(name)) {
    log(`skip package ${name}`);
    continue;
  }
  copyTree(join(root, 'packages', name), join(outRoot, 'packages', name));
}

patchCliForStub(outRoot);
patchRootPackage(outRoot);
patchDevWebScript(outRoot);
writePublicReadme(outRoot);
writeLicense(outRoot);
assertNoClosedSource(outRoot);

log(`exported → ${outRoot}`);
log('next: cd into out, pnpm install && pnpm run build && pnpm test');
