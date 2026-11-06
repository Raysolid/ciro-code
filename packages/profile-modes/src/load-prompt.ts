import type { ModeId } from './types.js';
import {
  BASE_SYSTEM_PROMPT,
  MODE_DELTA_PROMPTS,
  MODE_SYSTEM_PROMPTS,
} from '../generated/mode-prompts.js';

export function loadBaseSystemPrompt(): string {
  const text = BASE_SYSTEM_PROMPT;
  if (!text?.trim()) {
    throw new Error('[profile-modes] missing embedded base prompt');
  }
  return text;
}

export function loadModeDeltaPrompt(mode: ModeId): string {
  const text = MODE_DELTA_PROMPTS[mode];
  if (!text?.trim()) {
    throw new Error(`[profile-modes] missing embedded mode delta: ${mode}`);
  }
  return text;
}

/** base ⊕ mode delta（兼容 / 会计展示） */
export function loadModeSystemPrompt(mode: ModeId): string {
  const text = MODE_SYSTEM_PROMPTS[mode];
  if (!text?.trim()) {
    throw new Error(`[profile-modes] missing embedded prompt: ${mode}`);
  }
  return text;
}
