import { describe, expect, it } from 'vitest';
import { createMinimalModeProfiles } from './mode-profile.js';

describe('createMinimalModeProfiles', () => {
  it('covers four modes with tool allowlists and presets', () => {
    const p = createMinimalModeProfiles();
    for (const mode of ['ask', 'agent', 'plan', 'debug'] as const) {
      const profile = p.getModeProfile(mode);
      expect(profile.id).toBe(mode);
      expect(profile.systemPrompt.trim()).not.toBe('');
      expect(profile.toolAllowlist.length).toBeGreaterThan(0);
      expect(p.systemPromptForMode(mode)).toBe(profile.systemPrompt);
      expect(p.toolsForMode(mode)).toEqual(profile.toolAllowlist);
    }
    expect(p.getModeProfile('ask').permissionPreset).toBe('workspace-readonly');
    expect(p.getModeProfile('agent').permissionPreset).toBe('workspace-write');
  });
});
