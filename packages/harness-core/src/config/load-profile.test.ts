import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEffectiveConfig } from './load-config.js';
import { initExampleWorkspace } from './init-example.js';
import { resolveProfileYamlPath } from './load-profile.js';

describe('profile overlay', () => {
  it('resolves builtin developer profile', () => {
    const path = resolveProfileYamlPath('developer');
    expect(path.replace(/\\/g, '/')).toMatch(/profiles\/developer\.yaml$/);
  });

  it('applies developer overlay under project and over defaults', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-profile-'));
    const effective = loadEffectiveConfig({ workspace, profile: 'developer' });
    expect(effective.profileId).toBe('developer');
    expect(effective.sources.mode).toBe('profile');
    expect(effective.config.mode).toBe('agent');
    expect(effective.config.tools).toContain('write');
    expect(effective.sources.tools).toBe('profile');
    expect(effective.paths.profile).toBeTruthy();
  });

  it('project config overrides profile', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-profile-proj-'));
    mkdirSync(join(workspace, '.ciro'), { recursive: true });
    writeFileSync(join(workspace, '.ciro', 'config.yaml'), `mode: ask\n`);
    const effective = loadEffectiveConfig({ workspace, profile: 'developer' });
    expect(effective.config.mode).toBe('ask');
    expect(effective.sources.mode).toBe('project');
  });

  it('rejects unknown profile id', () => {
    expect(() => resolveProfileYamlPath('no-such-profile-xyz')).toThrow(/not found/);
  });
});

describe('initExampleWorkspace', () => {
  it('copies react-ts into empty dir and errors on conflict without --force', () => {
    const dest = mkdtempSync(join(tmpdir(), 'harness-init-'));
    const first = initExampleWorkspace({ exampleId: 'react-ts', destDir: dest });
    expect(first.files).toContain('.ciro/config.yaml');
    expect(() =>
      initExampleWorkspace({ exampleId: 'react-ts', destDir: dest }),
    ).toThrow(/--force/);
    const forced = initExampleWorkspace({
      exampleId: 'react-ts',
      destDir: dest,
      force: true,
    });
    expect(forced.files.length).toBeGreaterThan(0);
    rmSync(dest, { recursive: true, force: true });
  });
});
