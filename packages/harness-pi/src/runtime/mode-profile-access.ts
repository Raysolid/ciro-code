import type { HarnessMode, ModeProfileProvider } from '@ciro-code/harness-shared';

let warnedMissingSplit = false;

function warnStaleProfilesOnce(): void {
  if (warnedMissingSplit) return;
  warnedMissingSplit = true;
  console.warn(
    '[ciro] modeProfiles missing baseSystemPrompt/modeDeltaForMode — rebuild @ciro-code/harness-shared + @ciro-code/profile-modes and restart the API (dev:web does not hot-reload the API process).',
  );
}

/** Stable system 核；兼容尚未 rebuild 的旧 Profile provider */
export function profileBaseSystemPrompt(profiles: ModeProfileProvider): string {
  if (typeof profiles.baseSystemPrompt === 'function') {
    return profiles.baseSystemPrompt();
  }
  warnStaleProfilesOnce();
  return profiles.systemPromptForMode('ask');
}

/** Mode delta；兼容旧 provider（退回整段 system，仅保不崩） */
export function profileModeDelta(
  profiles: ModeProfileProvider,
  mode: HarnessMode,
): string {
  if (typeof profiles.modeDeltaForMode === 'function') {
    return profiles.modeDeltaForMode(mode);
  }
  warnStaleProfilesOnce();
  return profiles.systemPromptForMode(mode);
}
