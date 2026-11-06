import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  legacyMemoryDir,
  legacyPathWarning,
  memoryDir,
  resolveReadableDir,
} from '../paths/product-paths.js';

const ALLOWED_FILES = new Set(['MEMORY.md', 'session-memory.md']);

export class MemoryStore {
  readonly root: string;
  readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = workspace;
    const primary = memoryDir(workspace);
    const legacy = legacyMemoryDir(workspace);
    const resolved = resolveReadableDir(primary, legacy);
    this.root = resolved.path;
    if (resolved.fromLegacy) {
      console.warn(`[ciro] ${legacyPathWarning('workspace memory', legacy)}`);
    } else {
      this.ensureLayout();
    }
  }

  ensureLayout(): void {
    mkdirSync(this.root, { recursive: true });
    const memoryMd = join(this.root, 'MEMORY.md');
    if (!existsSync(memoryMd)) {
      writeFileSync(
        memoryMd,
        '# Workspace Memory\n\nActive project facts entry point. Keep concise.\n',
        'utf-8',
      );
    }
    const sessionMemory = join(this.root, 'session-memory.md');
    if (!existsSync(sessionMemory)) {
      writeFileSync(sessionMemory, '# Session Memory\n\n', 'utf-8');
    }
  }

  private resolveSafe(relPath: string): string {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('..') || !ALLOWED_FILES.has(normalized)) {
      throw new Error(`Invalid memory path: ${relPath}`);
    }
    const abs = join(this.root, normalized);
    const rel = relative(this.root, abs);
    if (rel.startsWith('..') || rel.includes('..')) {
      throw new Error(`Memory path escapes root: ${relPath}`);
    }
    return abs;
  }

  getMemoryMd(): string {
    const path = join(this.root, 'MEMORY.md');
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  }

  getSessionMemory(): string {
    const path = join(this.root, 'session-memory.md');
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  }

  read(relPath: string): string {
    const abs = this.resolveSafe(relPath);
    if (!existsSync(abs)) throw new Error(`Memory not found: ${relPath}`);
    return readFileSync(abs, 'utf-8');
  }

  writeRaw(relPath: string, content: string): void {
    const abs = this.resolveSafe(relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  /** 项目根 AGENTS.md（Rules）；不存在返回空串 */
  getProjectAgents(): string {
    const path = join(this.workspace, 'AGENTS.md');
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  }

  writeProjectAgents(content: string): void {
    writeFileSync(join(this.workspace, 'AGENTS.md'), content, 'utf-8');
  }

  projectAgentsExists(): boolean {
    return existsSync(join(this.workspace, 'AGENTS.md'));
  }

  memoryMdExists(): boolean {
    return existsSync(join(this.root, 'MEMORY.md'));
  }

  sessionMemoryExists(): boolean {
    return existsSync(join(this.root, 'session-memory.md'));
  }
}
