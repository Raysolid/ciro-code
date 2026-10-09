import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INIT_EXAMPLE_IDS = ['react-ts', 'node-api'] as const;
export type InitExampleId = (typeof INIT_EXAMPLE_IDS)[number];

export function isInitExampleId(value: string): value is InitExampleId {
  return (INIT_EXAMPLE_IDS as readonly string[]).includes(value);
}

/** 仓库示例根：`ciro/examples` */
export function examplesRoot(): string {
  return join(fileURLToPath(new URL('../../../../examples', import.meta.url)));
}

function listFilesRecursive(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * 将 `ciro/examples/<id>` 拷到目标目录。
 * 默认：任一目标路径已存在 → 抛错；`--force` 覆盖。
 */
export function initExampleWorkspace(opts: {
  exampleId: string;
  destDir: string;
  force?: boolean;
}): { exampleId: InitExampleId; destDir: string; files: string[] } {
  if (!isInitExampleId(opts.exampleId)) {
    throw new Error(
      `Unknown example "${opts.exampleId}". Use: ${INIT_EXAMPLE_IDS.join(' | ')}`,
    );
  }
  const srcRoot = join(examplesRoot(), opts.exampleId);
  if (!existsSync(srcRoot)) {
    throw new Error(`Example directory missing: ${srcRoot}`);
  }
  const files = listFilesRecursive(srcRoot);
  if (files.length === 0) {
    throw new Error(`Example "${opts.exampleId}" has no files`);
  }

  const conflicts = files
    .map((rel) => join(opts.destDir, rel))
    .filter((abs) => existsSync(abs));
  if (conflicts.length > 0 && !opts.force) {
    throw new Error(
      `Destination already has ${conflicts.length} file(s) (e.g. ${relative(opts.destDir, conflicts[0]!)}). Re-run with --force to overwrite.`,
    );
  }

  for (const rel of files) {
    const from = join(srcRoot, rel);
    const to = join(opts.destDir, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }

  return { exampleId: opts.exampleId, destDir: opts.destDir, files };
}
