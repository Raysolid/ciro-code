import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from './memory-store.js';
import { assembleMemoryInjection } from './memory-advisor.js';
import {
  writeGlobalAgents,
  setGlobalAgentsPathOverride,
} from './global-agents.js';
import { listMemoryEntries, writeMemoryEntry } from './memory-entries.js';

describe('MemoryStore', () => {
  it('ensures MEMORY.md and session-memory only', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mem-store-'));
    const store = new MemoryStore(workspace);
    expect(existsSync(join(workspace, '.ciro', 'memory', 'MEMORY.md'))).toBe(true);
    expect(existsSync(join(workspace, '.ciro', 'memory', 'session-memory.md'))).toBe(true);
    expect(existsSync(join(workspace, '.ciro', 'memory', 'index.json'))).toBe(false);
    store.writeRaw('MEMORY.md', '# Workspace Memory\n\nUse Vitest.\n');
    expect(store.getMemoryMd()).toContain('Vitest');
  });

  it('rejects typed memory paths', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mem-reject-'));
    const store = new MemoryStore(workspace);
    expect(() => store.writeRaw('project/arch.md', 'x')).toThrow(/Invalid memory path/);
  });

  it('MemoryAdvisor injects global + MEMORY.md without search', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mem-adv-'));
    const globalFile = join(workspace, 'fake-home', 'AGENTS.md');
    setGlobalAgentsPathOverride(globalFile);
    try {
      const store = new MemoryStore(workspace);
      writeFileSync(
        join(workspace, '.ciro', 'memory', 'MEMORY.md'),
        '# Workspace Memory\n\nUse pnpm not npm.\n',
        'utf-8',
      );
      writeGlobalAgents('# Global\n\nPrefer TypeScript.\n');

      const result = assembleMemoryInjection(store, 'anything');
      expect(result.injection).toContain('<global_memory>');
      expect(result.injection).toContain('<project_memory>');
      expect(result.injection).toContain('pnpm');
      expect(result.injection).toContain('TypeScript');
      expect(result.paths).toContain('~/.ciro/AGENTS.md');
      expect(result.paths).toContain('.ciro/memory/MEMORY.md');
      expect(result.tokenEstimate).toBeGreaterThan(0);
    } finally {
      setGlobalAgentsPathOverride(null);
    }
  });

  it('listMemoryEntries returns fixed entries', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mem-list-'));
    const store = new MemoryStore(workspace);
    writeMemoryEntry(store, 'AGENTS.md', '# Project\n\nUse Vitest.\n');
    const entries = listMemoryEntries(store);
    expect(entries.map((e) => e.id)).toEqual([
      'global-agents',
      'project-agents',
      'memory-md',
      'session-memory',
    ]);
    expect(entries.find((e) => e.id === 'project-agents')?.exists).toBe(true);
  });
});
