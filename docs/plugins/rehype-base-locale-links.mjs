import { visit } from 'unist-util-visit';

const BASE = '/ciro-code/docs';
const LOCALES = new Set(['en', 'zh-cn']);

/**
 * Prefix root-absolute in-docs links with base + locale.
 * Fixes GitHub Project Pages under /ciro-code/docs (root domain hosts another site).
 */
export function rehypeBaseLocaleLinks() {
  return (tree, file) => {
    const path = String(file.path || file.history?.[0] || '');
    const match = path.replace(/\\/g, '/').match(/\/content\/docs\/(en|zh-cn)\//);
    const locale = match?.[1] && LOCALES.has(match[1]) ? match[1] : 'en';

    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return;
      const href = node.properties?.href;
      if (typeof href !== 'string') return;
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (href.startsWith(BASE)) return;
      if (
        href.startsWith('/_astro') ||
        href.startsWith('/pagefind') ||
        href.startsWith('/favicon') ||
        href.startsWith('/llms')
      ) {
        return;
      }

      if (href === '/') {
        node.properties.href = `${BASE}/${locale}/`;
        return;
      }

      node.properties.href = `${BASE}/${locale}${href}`;
    });
  };
}
