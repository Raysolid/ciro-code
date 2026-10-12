import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {bezier, mix, ramp} from '../lib/motion';

/** Dark soft-edge wipe only — no light-leak */
const SOFT = 280;
const CORE = 2200;
const OCC_W = CORE + SOFT * 2;
const SWEEP_EASE = bezier(0.3, 0, 0.7, 1);

export const WipeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const x = mix(1940, -OCC_W - 40, ramp(frame, 2, 36, SWEEP_EASE));

  return (
    <AbsoluteFill style={{background: T.bgDeep, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          top: -40,
          bottom: -40,
          left: x,
          width: OCC_W,
          background: `linear-gradient(90deg, rgba(14,15,14,0) 0px, rgba(14,15,14,0.9) ${SOFT * 0.55}px, #0e0f0e ${SOFT}px, #0c0d0c ${SOFT + CORE}px, rgba(12,13,12,0.85) ${SOFT + CORE + SOFT * 0.4}px, rgba(12,13,12,0) ${OCC_W}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
