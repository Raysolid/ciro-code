import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEffectiveConfig } from './load-config.js';
import { patchProjectExploreModel } from './patch-project-subagents.js';

describe('patchProjectExploreModel', () => {
  it('writes exploreModel into project .ciro/config.yaml', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-patch-sub-'));
    const { path, exploreModel } = patchProjectExploreModel(workspace, 'fast');
    expect(exploreModel).toBe('fast');
    expect(path).toContain('.ciro');
    const text = readFileSync(path, 'utf-8');
    expect(text).toMatch(/exploreModel:\s*fast/);

    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.subagents.exploreModel).toBe('fast');
    expect(effective.sources.subagents).toBe('project');
  });

  it('preserves existing mode when patching', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-patch-sub2-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(join(workspace, '.ciro', 'config.yaml'), `mode: agent\n`);
    patchProjectExploreModel(workspace, 'inherit');
    const effective = loadEffectiveConfig({ workspace });
    expect(effective.config.mode).toBe('agent');
    expect(effective.config.subagents.exploreModel).toBe('inherit');
  });
});
