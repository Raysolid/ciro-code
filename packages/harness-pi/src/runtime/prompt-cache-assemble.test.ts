import { describe, expect, it } from 'vitest';
import { createMinimalModeProfiles } from '@ciro-code/harness-shared';
import { buildEphemeralExtras, buildStableSystemPrompt } from './runtime-shared.js';
import { buildEphemeralContextText } from './pi-session-factory.js';

describe('prompt cache assemble helpers', () => {
  it('keeps stable system free of mode delta and skills', () => {
    const profiles = createMinimalModeProfiles();
    const stable = buildStableSystemPrompt({
      base: profiles.baseSystemPrompt(),
      alwaysRules: '# Active rules\n\n## Rule: always',
      memory: '# Memory\n\nfacts',
    });
    expect(stable).toContain(profiles.baseSystemPrompt());
    expect(stable).toContain('# Active rules');
    expect(stable).toContain('# Memory');
    expect(stable).not.toContain(profiles.modeDeltaForMode('agent'));
  });

  it('puts mode delta and skills only in ephemeral', () => {
    const profiles = createMinimalModeProfiles();
    const ephemeral = buildEphemeralExtras({
      modeDelta: profiles.modeDeltaForMode('ask'),
      skills: '# Active skills\n\n## Skill: review',
      globRules: '# Path-matched rules\n\n## Rule: ts',
    });
    expect(ephemeral).toContain('Ask mode');
    expect(ephemeral).toContain('Active skills');
    expect(ephemeral).toContain('Path-matched rules');
    expect(ephemeral).not.toContain(profiles.baseSystemPrompt());
  });

  it('applies debug reminder onto ephemeral text without requiring system', () => {
    const text = buildEphemeralContextText('# Debug mode\n\nIngest: {{DEBUG_INGEST_URL}}', {
      debugSessionId: 'd1',
      ingestUrl: 'http://127.0.0.1:9',
      logPathRel: '.ciro/debug/x.log',
    });
    expect(text).toContain('http://127.0.0.1:9');
    expect(text).not.toContain('{{DEBUG_INGEST_URL}}');
  });
});
