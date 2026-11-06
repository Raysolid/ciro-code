import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { roughTokenEstimate } from '../context/token-estimate.js';
import {
  DEFAULT_GLOBAL_AGENTS_TEMPLATE,
  globalAgentsPath,
  isGlobalAgentsPath,
  readGlobalAgents,
  writeGlobalAgents,
} from './global-agents.js';
import type { MemoryStore } from './memory-store.js';
import {
  DISPLAY_GLOBAL_AGENTS,
  DISPLAY_MEMORY_MD,
  DISPLAY_SESSION_MEMORY,
} from '../paths/product-paths.js';

export type MemoryEntryId = 'global-agents' | 'project-agents' | 'memory-md' | 'session-memory';

export type MemoryEntryGroup = 'global' | 'project';

export interface MemoryEntryMeta {
  id: MemoryEntryId;
  group: MemoryEntryGroup;
  title: string;
  /** 展示用路径 */
  displayPath: string;
  /** API / 工具 path 键 */
  path: string;
  exists: boolean;
  chars: number;
  tokenEstimate: number;
  /** 是否进入常驻记忆注入 */
  injected: boolean;
  /** session-memory 为 compact 专用 */
  advanced?: boolean;
  editable: boolean;
}

export const MEMORY_MD_MAX_CHARS = 4000;
export const GLOBAL_AGENTS_MAX_CHARS = 4000;

const DEFAULT_PROJECT_AGENTS_TEMPLATE = `# Project Guidelines

Project-specific conventions and rules. Keep concise.

## Stack

-

## Conventions

-
`;

const DEFAULT_MEMORY_MD_TEMPLATE = `# Workspace Memory

Active project facts. Keep concise. Do not duplicate AGENTS.md rules.

## Facts

-
`;

export function listMemoryEntries(store: MemoryStore): MemoryEntryMeta[] {
  const globalContent = readGlobalAgents();
  const projectAgents = store.getProjectAgents();
  const memoryMd = store.getMemoryMd();
  const sessionMemory = store.getSessionMemory();

  return [
    {
      id: 'global-agents',
      group: 'global',
      title: 'User AGENTS.md',
      displayPath: DISPLAY_GLOBAL_AGENTS,
      path: DISPLAY_GLOBAL_AGENTS,
      exists: existsSync(globalAgentsPath()),
      chars: globalContent.length,
      tokenEstimate: roughTokenEstimate(globalContent),
      injected: true,
      editable: true,
    },
    {
      id: 'project-agents',
      group: 'project',
      title: 'AGENTS.md',
      displayPath: 'AGENTS.md',
      path: 'AGENTS.md',
      exists: store.projectAgentsExists(),
      chars: projectAgents.length,
      tokenEstimate: roughTokenEstimate(projectAgents),
      injected: false, // Pi ResourceLoader 注入；侧栏仍可编辑
      editable: true,
    },
    {
      id: 'memory-md',
      group: 'project',
      title: 'MEMORY.md',
      displayPath: DISPLAY_MEMORY_MD,
      path: 'MEMORY.md',
      exists: store.memoryMdExists(),
      chars: memoryMd.length,
      tokenEstimate: roughTokenEstimate(memoryMd),
      injected: true,
      editable: true,
    },
    {
      id: 'session-memory',
      group: 'project',
      title: 'session-memory.md',
      displayPath: DISPLAY_SESSION_MEMORY,
      path: 'session-memory.md',
      exists: store.sessionMemoryExists(),
      chars: sessionMemory.length,
      tokenEstimate: roughTokenEstimate(sessionMemory),
      injected: false,
      advanced: true,
      editable: true,
    },
  ];
}

export function resolveEntryId(pathOrId: string): MemoryEntryId | null {
  const p = pathOrId.trim().replace(/\\/g, '/');
  if (p === 'global-agents' || isGlobalAgentsPath(pathOrId)) {
    return 'global-agents';
  }
  if (p === 'project-agents' || p === 'AGENTS.md') {
    return 'project-agents';
  }
  if (
    p === 'memory-md' ||
    p === 'MEMORY.md' ||
    p === DISPLAY_MEMORY_MD ||
    p === '.pi/memory/MEMORY.md'
  ) {
    return 'memory-md';
  }
  if (
    p === 'session-memory' ||
    p === 'session-memory.md' ||
    p === DISPLAY_SESSION_MEMORY ||
    p === '.pi/memory/session-memory.md'
  ) {
    return 'session-memory';
  }
  return null;
}

export function readMemoryEntry(store: MemoryStore, pathOrId: string): string {
  const id = resolveEntryId(pathOrId);
  if (!id) throw new Error(`Unknown memory entry: ${pathOrId}`);
  switch (id) {
    case 'global-agents':
      return readGlobalAgents();
    case 'project-agents':
      return store.getProjectAgents();
    case 'memory-md':
      return store.getMemoryMd();
    case 'session-memory':
      return store.getSessionMemory();
  }
}

export function writeMemoryEntry(store: MemoryStore, pathOrId: string, content: string): void {
  const id = resolveEntryId(pathOrId);
  if (!id) throw new Error(`Unknown memory entry: ${pathOrId}`);
  switch (id) {
    case 'global-agents':
      writeGlobalAgents(content);
      return;
    case 'project-agents':
      store.writeProjectAgents(content);
      return;
    case 'memory-md':
      store.writeRaw('MEMORY.md', content);
      return;
    case 'session-memory':
      store.writeRaw('session-memory.md', content);
      return;
  }
}

/** 空文件时写入默认模板 */
export function ensureMemoryEntry(store: MemoryStore, pathOrId: string): string {
  const id = resolveEntryId(pathOrId);
  if (!id) throw new Error(`Unknown memory entry: ${pathOrId}`);
  const existing = readMemoryEntry(store, id);
  if (existing.trim()) return existing;
  let template = '';
  switch (id) {
    case 'global-agents':
      template = DEFAULT_GLOBAL_AGENTS_TEMPLATE;
      break;
    case 'project-agents':
      template = DEFAULT_PROJECT_AGENTS_TEMPLATE;
      break;
    case 'memory-md':
      template = DEFAULT_MEMORY_MD_TEMPLATE;
      break;
    case 'session-memory':
      template = '# Session Memory\n\n';
      break;
  }
  writeMemoryEntry(store, id, template);
  return template;
}

export function projectAgentsWorkspacePath(workspace: string): string {
  return join(workspace, 'AGENTS.md');
}
