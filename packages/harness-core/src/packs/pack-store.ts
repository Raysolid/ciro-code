import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { HARNESS_VERSION, type PackListItem, type PackManifest, type PacksListResponse } from '@ciro/harness-shared';
import {
  packsDir,
  packsModulesDir,
} from '../paths/product-paths.js';
import { PackContributionRegistry } from './contribution-registry.js';

const OFFICIAL_PACK_RE = /^@ciro\/ext-[a-z][a-z0-9-]*$/;

export function isOfficialPackId(id: string): boolean {
  return OFFICIAL_PACK_RE.test(id);
}

export function assertOfficialPackId(id: string): void {
  if (!isOfficialPackId(id)) {
    throw new Error(
      `Only official packs matching @ciro/ext-* are allowed (got: ${id})`,
    );
  }
}

type EnabledFile = { enabled: string[] };

function readEnabled(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as EnabledFile;
    return new Set(Array.isArray(raw.enabled) ? raw.enabled.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeEnabled(path: string, enabled: Set<string>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ enabled: [...enabled].sort() }, null, 2),
    'utf-8',
  );
}

function packModulePath(packId: string): string {
  return join(packsModulesDir(), ...packId.split('/'));
}

function readManifest(installPath: string): PackManifest | null {
  const manifestPath = join(installPath, 'ciro.pack.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PackManifest;
    if (!raw?.id || !raw.version) return null;
    return raw;
  } catch {
    return null;
  }
}

function checkCompatible(manifest: PackManifest): { ok: boolean; reason?: string } {
  const range = manifest.engines?.ciro;
  if (!range) return { ok: true };
  // 最小实现：要求声明的版本前缀与当前主版本一致，或为 * / >=0
  if (range === '*' || range.startsWith('>=0')) return { ok: true };
  const currentMajor = HARNESS_VERSION.split('.')[0] ?? '0';
  if (range.includes(currentMajor)) return { ok: true };
  return {
    ok: false,
    reason: `engines.ciro=${range} incompatible with harness ${HARNESS_VERSION}`,
  };
}

export type PackStoreOptions = {
  packsRoot?: string;
  registry?: PackContributionRegistry;
};

export class PackStore {
  readonly packsRoot: string;
  readonly modulesRoot: string;
  readonly enabledPath: string;
  readonly registry: PackContributionRegistry;

  constructor(opts: PackStoreOptions = {}) {
    this.packsRoot = opts.packsRoot ?? packsDir();
    this.modulesRoot = join(this.packsRoot, 'modules');
    this.enabledPath = join(this.packsRoot, 'enabled.json');
    this.registry = opts.registry ?? new PackContributionRegistry();
    this.reload();
  }

  private installPathFor(packId: string): string {
    return join(this.modulesRoot, ...packId.split('/'));
  }

  listInstalledIds(): string[] {
    const scopeDir = join(this.modulesRoot, '@ciro');
    if (!existsSync(scopeDir)) return [];
    try {
      return readdirSync(scopeDir)
        .filter((name) => name.startsWith('ext-'))
        .map((name) => `@ciro/${name}`)
        .filter((id) => {
          try {
            return statSync(this.installPathFor(id)).isDirectory();
          } catch {
            return false;
          }
        });
    } catch {
      return [];
    }
  }

  list(): PacksListResponse {
    const enabled = readEnabled(this.enabledPath);
    const packs: PackListItem[] = [];
    for (const id of this.listInstalledIds()) {
      const installPath = this.installPathFor(id);
      const manifest = readManifest(installPath);
      if (!manifest) continue;
      if (manifest.id !== id) continue;
      const compat = checkCompatible(manifest);
      const isEnabled = enabled.has(id) && compat.ok;
      packs.push({
        id,
        displayName: manifest.displayName || id,
        version: manifest.version,
        enabled: isEnabled,
        installPath,
        compatible: compat.ok,
        incompatibilityReason: compat.reason,
        contributions: {
          sidePanels: manifest.contributions?.sidePanels ?? [],
        },
      });
    }
    packs.sort((a, b) => a.id.localeCompare(b.id));
    return {
      packs,
      contributions: {
        sidePanels: this.registry.listSidePanels(),
      },
    };
  }

  /** 扫描已装包并重建贡献表（仅 enabled + compatible） */
  reload(): PacksListResponse {
    this.registry.clear();
    const enabled = readEnabled(this.enabledPath);
    for (const id of this.listInstalledIds()) {
      if (!enabled.has(id)) continue;
      const manifest = readManifest(this.installPathFor(id));
      if (!manifest || !checkCompatible(manifest).ok) continue;
      for (const panel of manifest.contributions?.sidePanels ?? []) {
        this.registry.registerSidePanel(id, panel);
      }
    }
    return this.list();
  }

  setEnabled(packId: string, enabled: boolean): PackListItem {
    assertOfficialPackId(packId);
    const installPath = this.installPathFor(packId);
    if (!existsSync(installPath)) {
      throw new Error(`Pack not installed: ${packId}`);
    }
    const manifest = readManifest(installPath);
    if (!manifest) throw new Error(`Invalid pack manifest: ${packId}`);
    const compat = checkCompatible(manifest);
    if (enabled && !compat.ok) {
      throw new Error(compat.reason ?? 'Pack incompatible');
    }
    const set = readEnabled(this.enabledPath);
    if (enabled) set.add(packId);
    else set.delete(packId);
    writeEnabled(this.enabledPath, set);
    this.reload();
    const item = this.list().packs.find((p) => p.id === packId);
    if (!item) throw new Error(`Pack not found after enable toggle: ${packId}`);
    return item;
  }

  /**
   * 从本地目录安装官方 Pack（复制到 ~/.ciro/packs/modules）。
   * 要求目录内 package.json / ciro.pack.json 的 id 与 packId 一致且为 @ciro/ext-*。
   */
  addFromDirectory(packId: string, sourceDir: string): PackListItem {
    assertOfficialPackId(packId);
    if (!existsSync(sourceDir)) {
      throw new Error(`Source directory not found: ${sourceDir}`);
    }
    const pkgPath = join(sourceDir, 'package.json');
    const manifest = readManifest(sourceDir);
    if (!manifest) {
      throw new Error(`Missing or invalid ciro.pack.json in ${sourceDir}`);
    }
    if (manifest.id !== packId) {
      throw new Error(`Manifest id ${manifest.id} does not match ${packId}`);
    }
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name && pkg.name !== packId) {
          throw new Error(`package.json name ${pkg.name} does not match ${packId}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('does not match')) throw e;
      }
    }
    const dest = this.installPathFor(packId);
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    cpSync(sourceDir, dest, { recursive: true });
    // 安装 ≠ 启用
    this.reload();
    const item = this.list().packs.find((p) => p.id === packId);
    if (!item) throw new Error(`Pack install failed: ${packId}`);
    return item;
  }

  remove(packId: string): void {
    assertOfficialPackId(packId);
    const dest = this.installPathFor(packId);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    const set = readEnabled(this.enabledPath);
    set.delete(packId);
    writeEnabled(this.enabledPath, set);
    this.reload();
  }

  ensureLayout(): void {
    mkdirSync(this.modulesRoot, { recursive: true });
    if (!existsSync(this.enabledPath)) {
      writeEnabled(this.enabledPath, new Set());
    }
  }

  /** 已安装且已启用且兼容 */
  isEnabled(packId: string): boolean {
    return this.list().packs.some((p) => p.id === packId && p.enabled);
  }
}

export { packModulePath };
