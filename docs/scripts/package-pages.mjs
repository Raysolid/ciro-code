import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Docs-only package: nest under docs/ (no root redirect — landing owns /). */
const docsDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(docsDir, 'dist');
const outDir = join(docsDir, '_site');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'docs'), { recursive: true });
cpSync(distDir, join(outDir, 'docs'), { recursive: true });

console.log(`Packaged docs-only site → ${outDir}/docs`);
