import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillRegistry } from './skill-registry.js';

function writeSkill(workspace: string, name: string, frontmatter: string): void {
  const skillDir = join(workspace, '.ciro', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), frontmatter);
}

describe('SkillRegistry', () => {
  it('discovers project skills and matches explicit @trigger', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-skill-'));
    writeSkill(
      workspace,
      'review',
      `---\nname: review\ndescription: code review\ntriggers: [@review]\nrequiresMcp: [filesystem, github]\n---\n# Review\n`,
    );

    const registry = new SkillRegistry({ workspace });
    const listed = registry.list();
    const review = listed.find((s) => s.name === 'review');
    expect(review).toBeTruthy();
    expect(review!.requiresMcp).toEqual(['filesystem', 'github']);
    expect(review!.triggers).toEqual(['@review']);

    const activated = registry.matchTriggers('please @review this');
    expect(activated).toHaveLength(1);
    expect(activated[0]!.name).toBe('review');
  });

  it('matches /name by default without @name', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-skill-slash-'));
    writeSkill(workspace, 'review', `---\nname: review\ndescription: code review\n---\n# Review\n`);
    const registry = new SkillRegistry({ workspace });
    expect(registry.list()[0]!.triggers).toEqual([]);
    expect(registry.matchTriggers('/review foo')).toHaveLength(1);
    expect(registry.matchTriggers('please @review this')).toHaveLength(0);
    expect(registry.matchTriggers('https://x.com/review')).toHaveLength(0);
  });

  it('reload picks up skills added after construct', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'harness-skill-reload-'));
    const registry = new SkillRegistry({ workspace });
    expect(registry.list()).toHaveLength(0);
    writeSkill(workspace, 'review', `---\nname: review\ndescription: code review\n---\n# Review\n`);
    expect(registry.reload().some((s) => s.name === 'review')).toBe(true);
  });
});
