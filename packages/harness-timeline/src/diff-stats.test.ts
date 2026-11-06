import { describe, expect, it } from 'vitest';
import { countDiffStats, splitUnifiedDiffHunks } from './diff-stats.js';

describe('splitUnifiedDiffHunks', () => {
  it('splits multiple @@ hunks into separate cards', () => {
    const text = [
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -3,7 +3,7 @@',
      ' L2',
      ' L3',
      ' L4',
      '-L5',
      '+X5',
      ' L6',
      ' L7',
      ' L8',
      '@@ -13,7 +13,7 @@',
      ' L12',
      ' L13',
      ' L14',
      '-L15',
      '+X15',
      ' L16',
      ' L17',
      ' L18',
      '',
    ].join('\n');

    const slices = splitUnifiedDiffHunks(text, 'b.ts');
    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ additions: 1, deletions: 1 });
    expect(slices[1]).toMatchObject({ additions: 1, deletions: 1 });
    expect(slices[0]!.text).toContain('-L5');
    expect(slices[0]!.text).not.toContain('-L15');
    expect(slices[1]!.text).toContain('-L15');
    expect(countDiffStats(slices[0]!.text)).toEqual({ additions: 1, deletions: 1 });
  });

  it('returns empty when there are no changes', () => {
    expect(splitUnifiedDiffHunks('--- a/x\n+++ b/x\n')).toEqual([]);
  });
});
