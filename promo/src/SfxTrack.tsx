import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {SHOTS} from './shots';


/**
 * SFX only — no BGM.
 * Cue times use RELATIVE expressions off SHOTS.*.from
 */
type Cue = {
  file: string;
  at: number;
  volume?: number;
  durationInFrames?: number;
};

const CUES: Cue[] = [
  // Brand stroke settle
  {file: 'audio/sweep-fast-small.mp3', at: SHOTS.brand.from + 16, volume: 0.35, durationInFrames: 30},
  {file: 'audio/hit-weak.mp3', at: SHOTS.brand.from + 68, volume: 0.4, durationInFrames: 20},

  // Terminal typing + ready
  {
    file: 'audio/typewriter-digital.mp3',
    at: SHOTS.terminal.from + 10,
    volume: 0.45,
    durationInFrames: 40,
  },
  {file: 'audio/keyboard.mp3', at: SHOTS.terminal.from + 10, volume: 0.22, durationInFrames: 50},
  {file: 'audio/switch-tap.mp3', at: SHOTS.terminal.from + 48, volume: 0.4, durationInFrames: 15},
  {file: 'audio/bass-hit-short.mp3', at: SHOTS.terminal.from + 78, volume: 0.5, durationInFrames: 25},

  // Workbench push
  {
    file: 'audio/ui-zoom-in.mp3',
    at: SHOTS.workbench.from + 4,
    volume: 0.35,
    durationInFrames: 40,
  },
  {
    file: 'audio/air-woosh-quick.mp3',
    at: SHOTS.workbench.from + 2,
    volume: 0.28,
    durationInFrames: 30,
  },

  // Modes: two clicks + thumb slides
  {
    file: 'audio/switch-click-quick.mp3',
    at: SHOTS.modes.from + 36,
    volume: 0.55,
    durationInFrames: 12,
  },
  {
    file: 'audio/sweep-fast-small.mp3',
    at: SHOTS.modes.from + 40,
    volume: 0.3,
    durationInFrames: 18,
  },
  {
    file: 'audio/switch-click-quick.mp3',
    at: SHOTS.modes.from + 88,
    volume: 0.55,
    durationInFrames: 12,
  },
  {
    file: 'audio/sweep-fast-small.mp3',
    at: SHOTS.modes.from + 92,
    volume: 0.3,
    durationInFrames: 18,
  },

  // Diff scanline + annotations
  {
    file: 'audio/sweep-fast-small.mp3',
    at: SHOTS.diff.from + 8,
    volume: 0.25,
    durationInFrames: 40,
  },
  {file: 'audio/switch-tap.mp3', at: SHOTS.diff.from + 28, volume: 0.35, durationInFrames: 12},
  {file: 'audio/switch-tap.mp3', at: SHOTS.diff.from + 52, volume: 0.35, durationInFrames: 12},
  {file: 'audio/switch-tap.mp3', at: SHOTS.diff.from + 88, volume: 0.4, durationInFrames: 12},

  // Wipe
  {
    file: 'audio/air-woosh-quick.mp3',
    at: SHOTS.wipe.from + 4,
    volume: 0.45,
    durationInFrames: 30,
  },

  // Outro sentence: short riser → impact → one sparkle
  {
    file: 'audio/riser-cine.mp3',
    at: SHOTS.outro.from + 40,
    volume: 0.4,
    durationInFrames: 55,
  },
  {
    file: 'audio/bass-hit-short.mp3',
    at: SHOTS.outro.from + 90,
    volume: 0.55,
    durationInFrames: 25,
  },
  {
    file: 'audio/sparkle-touch.mp3',
    at: SHOTS.outro.from + 108,
    volume: 0.45,
    durationInFrames: 35,
  },
];

export const SfxTrack: React.FC = () => {
  return (
    <>
      {CUES.map((c, i) => (
        <Sequence key={i} from={c.at} durationInFrames={c.durationInFrames ?? 45} layout="none">
          <Audio src={staticFile(c.file)} volume={c.volume ?? 0.4} />
        </Sequence>
      ))}
    </>
  );
};
