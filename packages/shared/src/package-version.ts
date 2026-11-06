import { createRequire } from 'node:module';

/**
 * 按候选 id 读 package.json version；均失败则 fallback。
 * `fromImportMetaUrl` 一般为调用方 `import.meta.url`。
 */
export function readPackageVersion(
  fromImportMetaUrl: string,
  candidateIds: readonly string[],
  fallback: string,
): string {
  const require = createRequire(fromImportMetaUrl);
  for (const id of candidateIds) {
    try {
      const pkg = require(id) as { version?: string };
      if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
    } catch {
      // next
    }
  }
  return fallback;
}
