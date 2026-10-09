import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillRegistry } from './skill-registry.js';
import { assembleSkillInjection } from './skill-injector.js';

describe('assembleSkillInjection', () => {
  it('injects matched skill body within budget', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'skill-inj-'));
    const skillDir = join(workspace, '.ciro', 'skills', 'review');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: review\ntriggers: [@review]\n---\n# Review\n\nCheck diffs carefully.\n`,
    );

    const registry = new SkillRegistry({ workspace, maxInjectTokens: 8000 });
    const out = assembleSkillInjection(registry, 'please @review this PR');
    expect(out.activated).toHaveLength(1);
    expect(out.injection).toContain('Skill: review');
    expect(out.injection).toContain('Check diffs carefully');
    expect(out.tokenEstimate).toBeGreaterThan(0);
    expect(out.truncated).toBe(false);
  });

  it('truncates when over budget', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'skill-bud-'));
    const skillDir = join(workspace, '.ciro', 'skills', 'big');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: big\ntriggers: [@big]\n---\n${'WORD '.repeat(500)}`,
    );
    const registry = new SkillRegistry({ workspace, maxInjectTokens: 40 });
    const out = assembleSkillInjection(registry, '@big please');
    expect(out.activated.length).toBeGreaterThanOrEqual(1);
    expect(out.truncated).toBe(true);
    expect(out.tokenEstimate).toBeLessThanOrEqual(40 + 5);
  });

  it('skips skill when requiresMcp not all enabled', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'skill-mcp-'));
    const skillDir = join(workspace, '.ciro', 'skills', 'fs');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: fs\ntriggers: [@fs]\nrequiresMcp: [filesystem]\n---\n# FS skill\n`,
    );
    const registry = new SkillRegistry({ workspace });
    const denied = assembleSkillInjection(registry, '@fs please', {
      enabledMcpIds: new Set(),
    });
    expect(denied.activated).toHaveLength(0);
    expect(denied.injection).toBe('');

    const ok = assembleSkillInjection(registry, '@fs please', {
      enabledMcpIds: new Set(['filesystem']),
    });
    expect(ok.activated).toHaveLength(1);
    expect(ok.injection).toContain('FS skill');
  });

  it('injects on /name when no custom triggers', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'skill-slash-'));
    const skillDir = join(workspace, '.ciro', 'skills', 'review');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: review\n---\n# Review\n\nCheck diffs carefully.\n`,
    );
    const registry = new SkillRegistry({ workspace, maxInjectTokens: 8000 });
    const out = assembleSkillInjection(registry, '/review this PR');
    expect(out.activated).toHaveLength(1);
    expect(out.injection).toContain('Check diffs carefully');
  });
});

