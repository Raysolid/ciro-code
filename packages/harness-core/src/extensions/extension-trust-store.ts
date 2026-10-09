import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ExtensionListItem,
  ExtensionManifest,
  ExtensionsListResponse,
} from '@ciro/harness-shared';
import { extensionsDir, extensionsTrustPath } from '../paths/product-paths.js';

type TrustFile = { trustedIds: string[] };

export type ExtensionTrustStoreOptions = {
  extensionsRoot?: string;
  trustPath?: string;
};

function readTrust(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as TrustFile;
    return new Set(
      Array.isArray(raw.trustedIds)
        ? raw.trustedIds.filter((x) => typeof x === 'string' && x.length > 0)
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeTrust(path: string, trusted: Set<string>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ trustedIds: [...trusted].sort() }, null, 2),
    'utf-8',
  );
}

function readManifest(dir: string): ExtensionManifest | null {
  const manifestPath = join(dir, 'extension.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ExtensionManifest;
    if (
      typeof raw?.id !== 'string' ||
      !raw.id ||
      typeof raw?.name !== 'string' ||
      !raw.name ||
      typeof raw?.version !== 'string' ||
      !raw.version
    ) {
      return null;
    }
    return { id: raw.id, name: raw.name, version: raw.version };
  } catch {
    return null;
  }
}

/**
 * Agent Extension Trust 门禁（§9.2 MVP）。
 * 只发现 + 信任白名单。加载代码由 ExtensionHost 在 Trust 之后执行。
 */
export class ExtensionTrustStore {
  readonly extensionsRoot: string;
  readonly trustPath: string;

  constructor(opts: ExtensionTrustStoreOptions = {}) {
    this.extensionsRoot = opts.extensionsRoot ?? extensionsDir();
    this.trustPath = opts.trustPath ?? extensionsTrustPath();
  }

  ensureLayout(): void {
    mkdirSync(this.extensionsRoot, { recursive: true });
  }

  private discover(): ExtensionListItem[] {
    if (!existsSync(this.extensionsRoot)) return [];
    let entries: string[];
    try {
      entries = readdirSync(this.extensionsRoot);
    } catch {
      return [];
    }
    const trusted = readTrust(this.trustPath);
    const out: ExtensionListItem[] = [];
    for (const name of entries) {
      const abs = join(this.extensionsRoot, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (name === 'node_modules') continue;
      const manifest = readManifest(abs);
      if (!manifest) continue;
      // 目录名与 id 不一致时仍以 manifest.id 为准；同 id 后者覆盖前者
      const idx = out.findIndex((e) => e.id === manifest.id);
      const item: ExtensionListItem = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        path: abs,
        trusted: trusted.has(manifest.id),
      };
      if (idx >= 0) out[idx] = item;
      else out.push(item);
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  list(): ExtensionsListResponse {
    return { extensions: this.discover() };
  }

  reload(): ExtensionsListResponse {
    return this.list();
  }

  private requireDiscovered(id: string): ExtensionListItem {
    const item = this.discover().find((e) => e.id === id);
    if (!item) {
      throw new Error(`Extension not found: ${id}`);
    }
    return item;
  }

  trust(id: string): ExtensionListItem {
    const item = this.requireDiscovered(id);
    const set = readTrust(this.trustPath);
    set.add(id);
    writeTrust(this.trustPath, set);
    return { ...item, trusted: true };
  }

  untrust(id: string): ExtensionListItem {
    const item = this.requireDiscovered(id);
    const set = readTrust(this.trustPath);
    set.delete(id);
    writeTrust(this.trustPath, set);
    return { ...item, trusted: false };
  }

  isTrusted(id: string): boolean {
    return readTrust(this.trustPath).has(id);
  }
}
