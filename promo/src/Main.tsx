import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {T} from './tokens';
import {SHOTS} from './shots';
import {SfxTrack} from './SfxTrack';
import {BrandScene} from './scenes/Brand';
import {TerminalScene} from './scenes/Terminal';
import {WorkbenchScene} from './scenes/Workbench';
import {ModesScene} from './scenes/Modes';
import {DiffScene} from './scenes/Diff';
import {WipeScene} from './scenes/Wipe';
import {OutroScene} from './scenes/Outro';

export {SHOTS, TOTAL} from './shots';


export const CiroTour: React.FC = () => {
  return (
    <AbsoluteFill style={{background: T.bg}}>
      <Sequence from={SHOTS.brand.from} durationInFrames={SHOTS.brand.dur}>
        <BrandScene />
      </Sequence>
      <Sequence from={SHOTS.terminal.from} durationInFrames={SHOTS.terminal.dur}>
        <TerminalScene />
      </Sequence>
      <Sequence from={SHOTS.workbench.from} durationInFrames={SHOTS.workbench.dur}>
        <WorkbenchScene />
      </Sequence>
      <Sequence from={SHOTS.modes.from} durationInFrames={SHOTS.modes.dur}>
        <ModesScene />
      </Sequence>
      <Sequence from={SHOTS.diff.from} durationInFrames={SHOTS.diff.dur}>
        <DiffScene />
      </Sequence>
      <Sequence from={SHOTS.wipe.from} durationInFrames={SHOTS.wipe.dur}>
        <WipeScene />
      </Sequence>
      <Sequence from={SHOTS.outro.from} durationInFrames={SHOTS.outro.dur}>
        <OutroScene />
      </Sequence>
      <SfxTrack />
    </AbsoluteFill>
  );
};
