import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type {
  ExtensionListItem,
  ExtensionsListResponse,
  ExtensionUiNotifyLevel,
  HarnessMode,
} from '@ciro-code/harness-shared';
import type { ExtensionTrustStore } from './extension-trust-store.js';

export type ExtensionToolExecute = (
  params: Record<string, unknown>,
) => Promise<unknown>;

export type ExtensionToolRecord = {
  extensionId: string;
  name: string;
  fullName: string;
  description: string;
  readOnlyHint: boolean;
  execute: ExtensionToolExecute;
};

export type ExtensionToolDef = {
  name: string;
  description: string;
  readOnlyHint: boolean;
  execute: ExtensionToolExecute;
};

export type ExtensionContext = {
  extensionId: string;
  registerTool: (def: ExtensionToolDef) => void;
  ui: {
    notify: (level: ExtensionUiNotifyLevel, message: string) => void;
  };
};

export type ExtensionUiSink = (
  level: ExtensionUiNotifyLevel,
  message: string,
) => void;

const EXT_PREFIX = 'ext:';

export function isExtToolName(name: string): boolean {
  return name.startsWith(EXT_PREFIX) && name.split(':').length >= 3;
}

function isInsideDir(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type ExtensionHostOptions = {
  store: ExtensionTrustStore;
};

/**
 * Agent Extension Host（§9.2）：Trust 之后才 import；工具名 `ext:{id}:{name}`。
 */
export class ExtensionHost {
  private readonly store: ExtensionTrustStore;
  private readonly tools = new Map<string, ExtensionToolRecord>();
  private readonly loaded = new Set<string>();
  private readonly errors = new Map<string, string>();
  private uiSink: ExtensionUiSink | undefined;
  private loading: Promise<void> | null = null;
  private loadedOnce = false;

  constructor(opts: ExtensionHostOptions) {
    this.store = opts.store;
  }

  setUiSink(sink: ExtensionUiSink | undefined): void {
    this.uiSink = sink;
  }

  list(): ExtensionsListResponse {
    return {
      extensions: this.store.list().extensions.map((e) => this.annotate(e)),
    };
  }

  private annotate(item: ExtensionListItem): ExtensionListItem {
    if (!item.trusted) return item;
    const loadError = this.errors.get(item.id);
    return loadError ? { ...item, loadError } : item;
  }

  listTools(): ExtensionToolRecord[] {
    return [...this.tools.values()];
  }

  getReadOnlyHint(fullName: string): boolean | undefined {
    return this.tools.get(fullName)?.readOnlyHint;
  }

  activeNames(mode: HarnessMode): string[] {
    const readonly = mode === 'ask' || mode === 'plan';
    return this.listTools()
      .filter((t) => !readonly || t.readOnlyHint)
      .map((t) => t.fullName);
  }

  ensureLoaded(): Promise<void> {
    if (this.loadedOnce && !this.loading) return Promise.resolve();
    this.loading ??= this.reloadTrusted().finally(() => {
      this.loading = null;
      this.loadedOnce = true;
    });
    return this.loading;
  }

  async reloadTrusted(): Promise<void> {
    for (const id of [...this.loaded]) this.deactivate(id);
    this.errors.clear();
    const trusted = this.store.list().extensions.filter((e) => e.trusted);
    for (const item of trusted) {
      await this.activate(item.id);
    }
  }

  async trust(id: string): Promise<ExtensionListItem> {
    const item = this.store.trust(id);
    await this.activate(id);
    return this.annotate({ ...item, trusted: true });
  }

  untrust(id: string): ExtensionListItem {
    const item = this.store.untrust(id);
    this.deactivate(id);
    return item;
  }

  deactivate(id: string): void {
    this.purgeTools(id);
    this.loaded.delete(id);
    this.errors.delete(id);
  }

  async activate(id: string): Promise<void> {
    if (this.loaded.has(id) && !this.errors.has(id)) return;
    this.purgeTools(id);
    this.errors.delete(id);
    try {
      if (!this.store.isTrusted(id)) {
        throw new Error(`Extension not trusted: ${id}`);
      }
      const item = this.store.list().extensions.find((e) => e.id === id);
      if (!item) throw new Error(`Extension not found: ${id}`);
      await this.loadItem(item);
      this.loaded.add(id);
    } catch (err) {
      this.purgeTools(id);
      this.loaded.delete(id);
      this.errors.set(id, errText(err));
    }
  }

  private purgeTools(extensionId: string): void {
    for (const [full, rec] of this.tools) {
      if (rec.extensionId === extensionId) this.tools.delete(full);
    }
  }

  private async loadItem(item: ExtensionListItem): Promise<void> {
    const raw = JSON.parse(readFileSync(join(item.path, 'extension.json'), 'utf-8')) as {
      main?: unknown;
    };
    if (typeof raw.main !== 'string' || !raw.main.trim()) {
      throw new Error('extension.json missing main');
    }
    const mainRel = raw.main.trim();
    const candidate = join(item.path, mainRel);
    if (!existsSync(candidate)) {
      throw new Error(`extension main not found: ${mainRel}`);
    }
    const rootReal = realpathSync(item.path);
    const mainReal = realpathSync(candidate);
    if (!isInsideDir(rootReal, mainReal)) {
      throw new Error('extension main escapes extension directory');
    }
    const href = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      readFileSync(mainReal, 'utf8'),
    )}`;
    const mod = (await import(/* @vite-ignore */ href)) as {
      activate?: (ctx: ExtensionContext) => void | Promise<void>;
    };
    if (typeof mod.activate !== 'function') {
      throw new Error('extension main must export function activate');
    }
    const ctx: ExtensionContext = {
      extensionId: item.id,
      registerTool: (def) => this.registerTool(item.id, def),
      ui: {
        notify: (level, message) => {
          this.uiSink?.(level, message);
        },
      },
    };
    await mod.activate(ctx);
  }

  private registerTool(extensionId: string, def: ExtensionToolDef): void {
    if (typeof def.name !== 'string' || !def.name.trim()) {
      throw new Error('registerTool requires name');
    }
    if (typeof def.description !== 'string' || !def.description.trim()) {
      throw new Error('registerTool requires description');
    }
    if (typeof def.readOnlyHint !== 'boolean') {
      throw new Error('registerTool requires readOnlyHint boolean');
    }
    if (typeof def.execute !== 'function') {
      throw new Error('registerTool requires execute');
    }
    const fullName = `${EXT_PREFIX}${extensionId}:${def.name.trim()}`;
    if (this.tools.has(fullName)) {
      throw new Error(`duplicate tool: ${fullName}`);
    }
    this.tools.set(fullName, {
      extensionId,
      name: def.name.trim(),
      fullName,
      description: def.description.trim(),
      readOnlyHint: def.readOnlyHint,
      execute: def.execute,
    });
  }
}
