import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) {
      const html = readFileSync(full, 'utf8');
      const re = /href="(\/(?:getting-started|guides|reference|project)\/[^"]*)"/g;
      let m;
      while ((m = re.exec(html))) {
        bad.push(`${full}: ${m[1]}`);
      }
      if (/href="\/"(?![^"]*ciro-code)/.test(html) && html.includes('href="/"')) {
        // bare home without base — only flag docs-home style
      }
      const bareHome = [...html.matchAll(/href="\/"/g)];
      if (bareHome.length) bad.push(`${full}: href="/"`);
    }
  }
}

walk(dist);

if (bad.length) {
  console.error('Found links missing /ciro-code/docs base (+ locale):');
  for (const line of bad.slice(0, 40)) console.error(' ', line);
  if (bad.length > 40) console.error(`  … +${bad.length - 40} more`);
  process.exit(1);
}

console.log('base-link check OK');
