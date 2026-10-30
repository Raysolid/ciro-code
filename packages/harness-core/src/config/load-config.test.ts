import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEffectiveConfig, validateConfig } from './load-config.js';

describe('loadEffectiveConfig', () => {
  it('merges project over global defaults from .ciro', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(
      join(workspace, '.ciro', 'config.yaml'),
      `mode: agent\ntools: [read, write]\npermissions:\n  preset: workspace-write\n`,
    );

    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.mode).toBe('agent');
    expect(effective.config.tools).toEqual(['read', 'write']);
    expect(effective.config.permissions?.preset).toBe('workspace-write');
    expect(effective.sources.mode).toBe('project');
    expect(effective.paths.project).toContain('config.yaml');
    expect(effective.paths.project?.includes('.ciro')).toBe(true);
  });

  it('CLI mode overrides project', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-cli-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(join(workspace, '.ciro', 'config.yaml'), `mode: agent\n`);

    const effective = loadEffectiveConfig({ workspace, mode: 'ask' });
    expect(effective.config.mode).toBe('ask');
    expect(effective.sources.mode).toBe('cli');
  });

  it('reads legacy .pi config with warning', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-legacy-'));
    mkdirSync(join(workspace, '.pi'), { recursive: true });
    writeFileSync(join(workspace, '.pi', 'config.yaml'), `mode: ask\n`);

    const effective = loadEffectiveConfig({ workspace });
    expect(effective.warnings.some((w) => w.includes('legacy') || w.includes('migrate'))).toBe(
      true,
    );
    expect(effective.config.mode).toBe('ask');
    expect(effective.paths.projectLegacy).toBeTruthy();
  });

  it('prefers .ciro over legacy .pi', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-pref-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    mkdirSync(join(workspace, '.pi'), { recursive: true });
    writeFileSync(join(workspace, '.ciro', 'config.yaml'), `mode: agent\n`);
    writeFileSync(join(workspace, '.pi', 'config.yaml'), `mode: ask\n`);

    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.mode).toBe('agent');
    expect(effective.paths.projectLegacy).toBeUndefined();
  });

  it('validateConfig reports ok for defaults', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-val-'));
    const effective = loadEffectiveConfig({ workspace, agentBackend: 'mock' });
    const result = validateConfig(effective);
    expect(result.ok).toBe(true);
  });

  it('loads Phase 2 memory/compaction/session/skill defaults and project overrides', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-p2-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(
      join(workspace, '.ciro', 'config.yaml'),
      `
memory:
  indexing: bm25
  maxMemoryFiles: 10
compaction:
  mode: manual
  thresholds:
    background: 0.6
session:
  snapshotInterval: 100
skill:
  maxInjectTokens: 4000
ui:
  contextUsage:
    enabled: true
    style: inline-bar
`.trim(),
    );

    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.memory.maxMemoryFiles).toBe(10);
    expect(effective.config.memory.enableEmbedding).toBe(false);
    expect(effective.config.compaction.mode).toBe('manual');
    expect(effective.config.compaction.thresholds.background).toBe(0.6);
    expect(effective.config.session.snapshotInterval).toBe(100);
    expect(effective.config.skill.maxInjectTokens).toBe(4000);
    expect(effective.config.ui.contextUsage.style).toBe('inline-bar');
    expect(effective.sources.memory).toBe('project');
    expect(effective.sources.compaction).toBe('project');
  });

  it('ignores removed compaction keys enablePrediction/strategies', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-cfg-dead-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(
      join(workspace, '.ciro', 'config.yaml'),
      `
compaction:
  mode: ask
  enablePrediction: true
  strategies:
    - micro
    - full
  maxConsecutiveFailures: 5
`.trim(),
    );
    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.compaction.mode).toBe('ask');
    expect(effective.config.compaction.maxConsecutiveFailures).toBe(5);
    expect(effective.config.compaction).not.toHaveProperty('enablePrediction');
    expect(effective.config.compaction).not.toHaveProperty('strategies');
  });
});
