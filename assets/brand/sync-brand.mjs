/**
 * Regenerate dark wordmark + sync light/dark SVGs into website & docs public/.
 * Usage: node assets/brand/sync-brand.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const lightPath = path.join(dir, 'ciro-code.svg');
const darkPath = path.join(dir, 'ciro-code-dark.svg');

const light = fs.readFileSync(lightPath, 'utf8');
const dark = light
  .replace('Ciro Code logo — vector paths', 'Ciro Code logo - dark theme')
  .replace('dark navy lettering', 'light lettering for dark UI')
  .replaceAll('stop-color="#061633"', 'stop-color="#F2F6FC"')
  .replaceAll('stop-color="#040f29"', 'stop-color="#E8EEF7"')
  .replaceAll('stop-color="#071833"', 'stop-color="#F7FAFF"');

if (dark.includes('\uFFFD')) {
  throw new Error('dark svg contains U+FFFD — refuse to write corrupted UTF-8');
}

fs.writeFileSync(darkPath, dark, 'utf8');

const publicDirs = [
  path.join(dir, '../../website/public/brand'),
  path.join(dir, '../../docs/public/brand'),
];

for (const outDir of publicDirs) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(lightPath, path.join(outDir, 'ciro-code.svg'));
  fs.copyFileSync(darkPath, path.join(outDir, 'ciro-code-dark.svg'));
  console.log('synced', outDir);
}

console.log('ok', { light: fs.statSync(lightPath).size, dark: fs.statSync(darkPath).size });
