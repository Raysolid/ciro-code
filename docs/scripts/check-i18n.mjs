import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('../src/content/docs/', import.meta.url));
const enDir = join(docsRoot, 'en');
const zhDir = join(docsRoot, 'zh-cn');

function listMd(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listMd(full, base));
    else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      out.push(relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

const en = listMd(enDir);
const zh = listMd(zhDir);
const enSet = new Set(en);
const zhSet = new Set(zh);

const missingZh = en.filter((p) => !zhSet.has(p));
const missingEn = zh.filter((p) => !enSet.has(p));

if (missingZh.length || missingEn.length) {
  console.error('i18n slug mismatch:');
  if (missingZh.length) console.error('  missing zh-cn:', missingZh.join(', '));
  if (missingEn.length) console.error('  missing en:', missingEn.join(', '));
  process.exit(1);
}

console.log(`i18n OK: ${en.length} page pairs (en / zh-cn)`);
