import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const websiteDist = join(root, 'website', 'dist');
const docsDist = join(root, 'docs', 'dist');
const outDir = join(root, '_site');

if (!existsSync(websiteDist)) {
  console.error('Missing website/dist — run: npm run build (in website/)');
  process.exit(1);
}
if (!existsSync(docsDist)) {
  console.error('Missing docs/dist — run: npm run build (in docs/)');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(websiteDist, outDir, { recursive: true });
mkdirSync(join(outDir, 'docs'), { recursive: true });
cpSync(docsDist, join(outDir, 'docs'), { recursive: true });

console.log(`Packaged Pages site → ${outDir}`);
console.log('  /           ← website');
console.log('  /docs/      ← Starlight');
