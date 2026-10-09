import { extname } from 'node:path';

export type FileKind = 'text' | 'markdown' | 'image' | 'binary';

const MARKDOWN_EXT = new Set(['.md', '.mdx', '.markdown']);

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.avif',
]);

const TEXT_EXT = new Set([
  '.txt',
  '.text',
  '.log',
  '.csv',
  '.tsv',
  '.json',
  '.jsonc',
  '.json5',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.hpp',
  '.cs',
  '.swift',
  '.php',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.ps1',
  '.bat',
  '.cmd',
  '.dockerfile',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.vue',
  '.svelte',
  '.astro',
  '.graphql',
  '.gql',
  '.proto',
  '.r',
  '.lua',
  '.pl',
  '.pm',
  '.dart',
  '.scala',
  '.clj',
  '.ex',
  '.exs',
  '.erl',
  '.hs',
  '.ml',
  '.mli',
  '.nim',
  '.zig',
  '.v',
  '.vb',
  '.fs',
  '.fsx',
  '.tex',
  '.bib',
  '.rst',
  '.adoc',
  '.org',
  '.wiki',
  '.properties',
  '.gradle',
  '.tf',
  '.hcl',
  '.nix',
  '.lock',
  '.map',
]);

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
};

/** 按扩展名判断预览类型（svg 归 image） */
export function detectFileKind(filePath: string): FileKind {
  const ext = extname(filePath).toLowerCase();
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lowerBase = base.toLowerCase();

  if (
    !ext &&
    (lowerBase === 'dockerfile' ||
      lowerBase === 'makefile' ||
      lowerBase === 'cmakelists.txt' ||
      lowerBase.startsWith('license') ||
      lowerBase.startsWith('readme'))
  ) {
    return 'text';
  }

  if (IMAGE_EXT.has(ext)) return 'image';
  if (MARKDOWN_EXT.has(ext)) return 'markdown';
  if (TEXT_EXT.has(ext)) return 'text';
  // 无扩展名的常见文本配置
  if (!ext && /^[\w.-]+$/.test(base) && !base.includes('.')) {
    // ambiguous — treat as binary to avoid mojibake
    return 'binary';
  }
  return 'binary';
}

export function mimeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export function isTextPreviewKind(kind: FileKind): boolean {
  return kind === 'text' || kind === 'markdown';
}
