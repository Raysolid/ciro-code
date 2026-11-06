import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  baseSystemPrompt,
  getModeProfile,
  getModeProfiles,
  modeDeltaForMode,
  resetModeProfileCache,
  systemPromptForMode,
  toolsForMode,
} from './index.js';

describe('profile-modes', () => {
  it('loads four distinct profiles with non-empty prompts', () => {
    resetModeProfileCache();
    const profiles = getModeProfiles();
    expect(Object.keys(profiles).sort()).toEqual(['agent', 'ask', 'debug', 'plan']);
    for (const mode of ['ask', 'agent', 'plan', 'debug'] as const) {
      const p = getModeProfile(mode);
      expect(p.systemPrompt.trim()).not.toBe('');
      expect(p.toolAllowlist.length).toBeGreaterThan(0);
      expect(systemPromptForMode(mode)).toBe(p.systemPrompt);
    }
    expect(systemPromptForMode('ask')).not.toBe(systemPromptForMode('agent'));
    expect(systemPromptForMode('plan')).toMatch(/Plan/i);
  });

  it('ask is readonly-ish; agent includes write tools', () => {
    expect(toolsForMode('ask')).toContain('WebFetch');
    expect(toolsForMode('agent')).toContain('WebFetch');
    expect(toolsForMode('ask')).toContain('bash');
    expect(toolsForMode('ask')).toContain('SuggestMode');
    expect(toolsForMode('ask')).not.toContain('write');
    expect(toolsForMode('agent')).toEqual(
      expect.arrayContaining(['write', 'edit', 'bash', 'SuggestMode', 'Task', 'TodoWrite']),
    );
    expect(toolsForMode('debug')).toEqual(expect.arrayContaining(['TodoWrite', 'delete_file']));
    expect(toolsForMode('plan')).not.toContain('TodoWrite');
    expect(toolsForMode('ask')).not.toContain('TodoWrite');
    expect(toolsForMode('plan')).toEqual(
      expect.arrayContaining(['AskQuestion', 'CreatePlan', 'read', 'SuggestMode', 'Task']),
    );
    expect(toolsForMode('ask')).toContain('Task');
    expect(toolsForMode('debug')).not.toContain('Task');
    expect(toolsForMode('plan')).not.toContain('write');
    expect(systemPromptForMode('ask')).toMatch(/Task.*explore/i);
    expect(systemPromptForMode('ask')).toMatch(/run_in_background/i);
    expect(systemPromptForMode('agent')).toMatch(/run_in_background/i);
  });

  it('assembled prompts include base rules and mode-specific contracts', () => {
    resetModeProfileCache();
    const baseMark = 'When instructions conflict, follow this order:';
    const base = baseSystemPrompt();
    expect(base).toContain(baseMark);
    for (const mode of ['ask', 'agent', 'plan', 'debug'] as const) {
      expect(systemPromptForMode(mode)).toContain(baseMark);
      expect(systemPromptForMode(mode).startsWith(base)).toBe(true);
      expect(modeDeltaForMode(mode).trim()).not.toBe('');
    }
    expect(modeDeltaForMode('ask')).toContain(
      'This rule overrides any instruction to make changes.',
    );
    expect(modeDeltaForMode('debug')).toContain('{{DEBUG_INGEST_URL}}');
    expect(base).not.toContain('{{DEBUG_INGEST_URL}}');
    expect(systemPromptForMode('debug')).toContain('<reproduction_steps>');
  });

  it('mode source files do not repeat lifted base headings', () => {
    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    const lifted = [
      '## Communication',
      '## Safety and version control',
      '## Memory',
      '## Code citations',
    ];
    for (const mode of ['ask', 'agent', 'plan', 'debug']) {
      const text = readFileSync(join(promptsDir, `${mode}.md`), 'utf8');
      for (const heading of lifted) {
        expect(text, `${mode}.md still has ${heading}`).not.toContain(heading);
      }
    }
  });

  it('src must not reintroduce skills/cursor-mode runtime dependency', () => {
    const srcDir = dirname(fileURLToPath(import.meta.url));
    const banned = ['skills/cursor-mode', 'CIRO_SKILLS_ROOT', 'resolveCursorModeSkillsDir'];
    const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const file of files) {
      const text = readFileSync(join(srcDir, file), 'utf8');
      for (const needle of banned) {
        expect(text, `${file} contains ${needle}`).not.toContain(needle);
      }
    }
  });
});
