import { describe, expect, it } from 'vitest';
import { heuristicTitle } from './session-auto-title.js';

describe('session-auto-title', () => {
  it('heuristicTitle truncates long prompts', () => {
    const long = 'a'.repeat(80);
    const t = heuristicTitle(long, 36);
    expect(t.length).toBeLessThanOrEqual(36);
    expect(t.endsWith('…')).toBe(true);
  });

  it('heuristicTitle keeps short Chinese prompts', () => {
    expect(heuristicTitle('你是什么模型')).toBe('你是什么模型');
  });
});
