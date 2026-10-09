import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { shellAllowlistPath } from '../paths/product-paths.js';

type AllowlistFile = { patterns: string[] };

export type ShellAllowlistStoreOptions = {
  path?: string;
};

/** 规范化：trim + 折叠空白，用于精确匹配 */
export function normalizeShellCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

/**
 * Shell 命令白名单（§切片 A）。
 * 命中则 Policy ask 时免弹确认；仅持久化规范化后的完整命令字符串。
 */
export class ShellAllowlistStore {
  readonly path: string;
  private patterns: string[] = [];
  private loaded = false;

  constructor(opts: ShellAllowlistStoreOptions = {}) {
    this.path = opts.path ?? shellAllowlistPath();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(this.path)) {
      this.patterns = [];
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf-8')) as AllowlistFile;
      const list = Array.isArray(raw.patterns) ? raw.patterns : [];
      this.patterns = [
        ...new Set(
          list
            .filter((x): x is string => typeof x === 'string')
            .map(normalizeShellCommand)
            .filter((x) => x.length > 0),
        ),
      ].sort();
    } catch {
      this.patterns = [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(
      this.path,
      JSON.stringify({ patterns: this.patterns }, null, 2),
      'utf-8',
    );
  }

  list(): string[] {
    this.ensureLoaded();
    return [...this.patterns];
  }

  matches(command: string): boolean {
    this.ensureLoaded();
    const key = normalizeShellCommand(command);
    if (!key) return false;
    return this.patterns.includes(key);
  }

  add(command: string): boolean {
    this.ensureLoaded();
    const key = normalizeShellCommand(command);
    if (!key) return false;
    if (this.patterns.includes(key)) return false;
    this.patterns = [...this.patterns, key].sort();
    this.persist();
    return true;
  }

  remove(command: string): boolean {
    this.ensureLoaded();
    const key = normalizeShellCommand(command);
    const next = this.patterns.filter((p) => p !== key);
    if (next.length === this.patterns.length) return false;
    this.patterns = next;
    this.persist();
    return true;
  }

  setAll(commands: string[]): string[] {
    this.ensureLoaded();
    this.patterns = [
      ...new Set(
        commands.map(normalizeShellCommand).filter((x) => x.length > 0),
      ),
    ].sort();
    this.persist();
    return this.list();
  }

  clear(): void {
    this.ensureLoaded();
    if (this.patterns.length === 0) return;
    this.patterns = [];
    this.persist();
  }
}
