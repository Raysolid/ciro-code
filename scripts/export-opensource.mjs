#!/usr/bin/env node
/**
 * 过滤导出开源面 → 目标目录（默认 ../ciro-code）。
 * 排除 harness-ui、profile-cursor-modes、ext-smoke；导出后 CLI 改用 minimal stub。
 * **禁止**整树删除目标仓：保留 `.git` / `website` / Starlight `docs/src` / `package-pages.mjs`。
 * 同步约定见仓库根 `Ciro-Code-Harness设计方案.md` §23.3（changesets / publish 只在私有工作区）。
 *
 *   pnpm run export:opensource
 *   node ./scripts/export-opensource.mjs --out D:\workspace\ciro-chat\ciro-code
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

/** 公开仓门面：禁止整树 rm；导出时跳过这些路径 */
const PRESERVE_IN_OUT = new Set(['.git', 'website', '.github']);

const ROOT_FILES = [
  'package.json',
  'pnpm-workspace.yaml',
  // lockfile 含闭源包；导出后由 pnpm install 重新生成
  'tsconfig.base.json',
  'turbo.json',
  '.gitignore',
  'LICENSE',
];

const MANAGED_TOP_LEVEL = [
  'apps',
  'packages',
  'examples',
  'profiles',
  'scripts',
  ...ROOT_FILES,
];

function log(msg) {
  console.log(`[export-opensource] ${msg}`);
}

function shouldSkipPath(name, { allowDotCiro = false } = {}) {
  if (allowDotCiro && name === '.ciro') return false;
  return (
    SKIP_DIR_NAMES.has(name) ||
    name.endsWith('.tsbuildinfo') ||
    name.startsWith('.tmp-')
  );
}

function copyTree(src, dest, opts = {}) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (shouldSkipPath(name, opts)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = statSync(from);
    if (st.isDirectory()) copyTree(from, to, opts);
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
  delete pkg.dependencies?.['@ciro-code/profile-cursor-modes'];
  delete pkg.devDependencies?.['@ciro-code/profile-cursor-modes'];
  // 公开树无闭源 UI / Profile 构建物
  pkg.files = ['dist'];
  delete pkg.scripts?.prepack;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

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

  const loadProfilesPath = join(dest, 'apps', 'ciro-cli', 'src', 'load-mode-profiles.ts');
  if (existsSync(loadProfilesPath)) rmSync(loadProfilesPath);

  const cliPath = join(dest, 'apps', 'ciro-cli', 'src', 'cli.ts');
  let cli = readFileSync(cliPath, 'utf8');
  cli = cli.replace(
    /import \{ HARNESS_VERSION \} from '@ciro-code\/harness-shared';/,
    `import { HARNESS_VERSION, createMinimalModeProfiles } from '@ciro-code/harness-shared';`,
  );
  cli = cli.replace(/\r?\nimport \{ loadModeProfiles \} from '\.\/load-mode-profiles\.js';/, '');
  cli = cli.replace(/\r?\n\s*uiDistPath:\s*resolveBundledUiDist\(\),/g, '');
  cli = cli.replace(
    /\/\*\* npm 包内预打入的 UI dist[\s\S]*?function resolveBundledUiDist\(\): string \| undefined \{[\s\S]*?\}\r?\n\r?\n/,
    '',
  );
  cli = cli.replace(
    /import \{ existsSync \} from 'node:fs';\r?\nimport \{ dirname, join, resolve \} from 'node:path';\r?\nimport \{ fileURLToPath \} from 'node:url';\r?\n/,
    `import { resolve } from 'node:path';\n`,
  );
  // TUI + web 各有一处 modeProfiles
  cli = cli.replace(
    /modeProfiles:\s*await loadModeProfiles\(\),/g,
    'modeProfiles: createMinimalModeProfiles(),',
  );
  if (
    cli.includes('profile-cursor-modes') ||
    cli.includes('loadModeProfiles') ||
    cli.includes('createCursorModeProfileProvider')
  ) {
    throw new Error('CLI patch incomplete: still references proprietary profiles');
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
      'pnpm run build && pnpm --filter @ciro-code/cli exec node dist/cli.js web --no-open',
    'dev:web:mock':
      'pnpm run build && pnpm --filter @ciro-code/cli exec node dist/cli.js web --mock --no-open',
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
  ...packageFilters.filter((f) => f !== '--filter=@ciro-code/cli'),
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

function hasStarlightDocs(dest) {
  return existsSync(join(dest, 'docs', 'src'));
}

/** 只清 harness 托管路径；保留 .git / website / Starlight docs / Pages 脚本 */
function clearManagedPaths(dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
    return;
  }
  const pagesScript = join(dest, 'scripts', 'package-pages.mjs');
  const pagesScriptBackup = existsSync(pagesScript)
    ? readFileSync(pagesScript)
    : null;

  for (const name of MANAGED_TOP_LEVEL) {
    if (PRESERVE_IN_OUT.has(name)) continue;
    const p = join(dest, name);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  // 私有仓 docs 工程笔记 ≠ 公开 Starlight；有 docs/src 时不整目录替换
  if (!hasStarlightDocs(dest)) {
    const docsPath = join(dest, 'docs');
    if (existsSync(docsPath)) rmSync(docsPath, { recursive: true, force: true });
  }

  if (pagesScriptBackup) {
    mkdirSync(join(dest, 'scripts'), { recursive: true });
    writeFileSync(pagesScript, pagesScriptBackup);
  }
}

function mergePublicPackageScripts(dest) {
  const pkgPath = join(dest, 'package.json');
  if (!existsSync(pkgPath)) return;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const pagesScripts = {
    'build:website': 'npm run build --prefix website',
    'build:docs':
      'npm run check:i18n --prefix docs && npm run build --prefix docs && npm run check:base-links --prefix docs',
    'package:pages': 'node scripts/package-pages.mjs',
    'build:pages': 'npm run build:website && npm run build:docs && npm run package:pages',
  };
  if (existsSync(join(dest, 'website')) || existsSync(join(dest, 'docs', 'src'))) {
    pkg.scripts = { ...pkg.scripts, ...pagesScripts };
    // 公开仓不在此 publish
    delete pkg.scripts.changeset;
    delete pkg.scripts.version;
    delete pkg.scripts.release;
    delete pkg.scripts['export:opensource'];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }
}

function syncPrivateDocsSideFiles(dest) {
  const fromDocs = join(root, 'docs');
  if (!existsSync(fromDocs)) return;
  mkdirSync(join(dest, 'docs'), { recursive: true });
  for (const name of readdirSync(fromDocs)) {
    if (shouldSkipPath(name) || name === 'src') continue;
    const from = join(fromDocs, name);
    const to = join(dest, 'docs', name);
    const st = statSync(from);
    if (st.isDirectory()) {
      if (hasStarlightDocs(dest)) continue;
      copyTree(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

// --- main ---
log(`export → ${outRoot}`);
clearManagedPaths(outRoot);

for (const file of ROOT_FILES) {
  const from = join(root, file);
  if (existsSync(from)) cpSync(from, join(outRoot, file));
}

copyTree(join(root, 'apps'), join(outRoot, 'apps'));
// examples 内 `.ciro/config.yaml` 是可发布 fixture；其它路径仍跳过运行时 .ciro
copyTree(join(root, 'examples'), join(outRoot, 'examples'), { allowDotCiro: true });
if (existsSync(join(root, 'profiles'))) {
  copyTree(join(root, 'profiles'), join(outRoot, 'profiles'));
}
if (existsSync(join(root, 'scripts'))) {
  const scriptsDest = join(outRoot, 'scripts');
  mkdirSync(scriptsDest, { recursive: true });
  for (const name of readdirSync(join(root, 'scripts'))) {
    if (shouldSkipPath(name)) continue;
    cpSync(join(root, 'scripts', name), join(scriptsDest, name));
  }
}

syncPrivateDocsSideFiles(outRoot);

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
mergePublicPackageScripts(outRoot);
writePublicReadme(outRoot);
writeLicense(outRoot);
assertNoClosedSource(outRoot);

log(`exported → ${outRoot}`);
log('preserved: .git / website / Starlight docs/src (when present)');
log('next: cd into out, pnpm install && pnpm run build && pnpm test');
