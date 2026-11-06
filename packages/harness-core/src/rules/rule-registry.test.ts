import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuleRegistry } from './rule-registry.js';
import {
  assembleRulesInjection,
  matchGlob,
  ruleMatchesMessage,
} from './rule-injector.js';

describe('matchGlob', () => {
  it('matches ** and *', () => {
    expect(matchGlob('src/foo.ts', '**/*.ts')).toBe(true);
    expect(matchGlob('src/foo.ts', 'src/*')).toBe(true);
    expect(matchGlob('src/a/foo.ts', 'src/*')).toBe(false);
    expect(matchGlob('readme.md', '**/*.ts')).toBe(false);
  });
});

describe('RuleRegistry + assembleRulesInjection', () => {
  it('lists AGENTS.md and injects project rules with globs', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-rules-'));
    writeFileSync(join(root, 'AGENTS.md'), '# Project\n');
    const rulesDir = join(root, '.ciro', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, 'ts.md'),
      `---
description: TS only
globs: ["**/*.ts"]
enabled: true
---
Use strict TypeScript.
`,
    );
    writeFileSync(
      join(rulesDir, 'off.md'),
      `---
enabled: false
---
Should not inject.
`,
    );

    const registry = new RuleRegistry({ workspace: root });
    const list = registry.list();
    expect(list.some((r) => r.source === 'agents')).toBe(true);
    expect(list.some((r) => r.name === 'ts')).toBe(true);

    const withPath = assembleRulesInjection(registry, 'Please review src/app.ts');
    expect(withPath.injection).toContain('strict TypeScript');
    expect(withPath.injection).not.toContain('Should not inject');
    expect(withPath.included.some((r) => r.source === 'agents')).toBe(false);

    const noPath = assembleRulesInjection(registry, 'hello');
    expect(noPath.injection).not.toContain('strict TypeScript');
    expect(noPath.included).toHaveLength(0);

    const meta = list.find((r) => r.name === 'ts')!;
    expect(ruleMatchesMessage(meta, 'edit src/app.ts')).toBe(true);
    expect(ruleMatchesMessage(meta, 'hello')).toBe(false);
  });

  it('empty globs stay always-on; globs miss when path tokens do not match', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-rules-glob-'));
    const rulesDir = join(root, '.ciro', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, 'global.md'),
      `---
enabled: true
---
Always on global rule.
`,
    );
    writeFileSync(
      join(rulesDir, 'ts.md'),
      `---
globs: ["**/*.ts"]
enabled: true
---
TS scoped.
`,
    );
    const registry = new RuleRegistry({ workspace: root });

    const plain = assembleRulesInjection(registry, 'explain architecture');
    expect(plain.injection).toContain('Always on global rule');
    expect(plain.injection).not.toContain('TS scoped');

    const mdOnly = assembleRulesInjection(registry, 'edit docs/readme.md');
    expect(mdOnly.injection).toContain('Always on global rule');
    expect(mdOnly.injection).not.toContain('TS scoped');

    const tsHit = assembleRulesInjection(registry, 'edit src/app.ts');
    expect(tsHit.injection).toContain('Always on global rule');
    expect(tsHit.injection).toContain('TS scoped');
  });

  it('setEnabled toggles frontmatter', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-rules-en-'));
    const rulesDir = join(root, '.ciro', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, 'a.md'), '---\nenabled: true\n---\nBody\n');
    const registry = new RuleRegistry({ workspace: root });
    const id = 'project:a.md';
    registry.setEnabled(id, false);
    const again = assembleRulesInjection(registry, 'x');
    expect(again.injection).toBe('');
  });

  it('discovers nested rules under .ciro/rules/**', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-rules-nest-'));
    const nested = join(root, '.ciro', 'rules', 'team');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'style.md'), '---\nenabled: true\n---\nNested style rule.\n');
    const registry = new RuleRegistry({ workspace: root });
    const list = registry.list();
    const nestedRule = list.find((r) => r.id === 'project:team/style.md');
    expect(nestedRule).toBeDefined();
    expect(nestedRule!.name).toBe('team/style');
    const inj = assembleRulesInjection(registry, 'hello');
    expect(inj.injection).toContain('Nested style rule');
  });
});
