import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(docsDir, 'dist');
const outDir = join(docsDir, '_site');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'docs'), { recursive: true });
cpSync(distDir, join(outDir, 'docs'), { recursive: true });

writeFileSync(
  join(outDir, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=/ciro-code/docs/" />
    <link rel="canonical" href="/ciro-code/docs/" />
    <script>location.replace('/ciro-code/docs/')</script>
    <title>Ciro Code</title>
  </head>
  <body>
    <p><a href="/ciro-code/docs/">Ciro Code documentation</a></p>
  </body>
</html>
`,
);

console.log(`Packaged Pages site → ${outDir}`);
