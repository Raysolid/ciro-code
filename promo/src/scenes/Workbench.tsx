import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, ramp} from '../lib/motion';

/** PageCam push on workbench still: 1.0 → 1.12 over 150f, hold end 20f */
export const WorkbenchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const zoomDur = 130; // leave ~20f hold at end
  const z = 1 + 0.12 * ramp(frame, 0, zoomDur, EASE.smooth);
  const caption = ramp(frame, 12, 20, EASE.out);

  return (
    <AbsoluteFill style={{background: T.bg, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${z.toFixed(5)})`,
          transformOrigin: '52% 48%',
        }}
      >
        <Img
          src={staticFile('media/workbench.png')}
          style={{width: 1920, height: 1080, objectFit: 'cover'}}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 75% 70% at 50% 45%, transparent 50%, rgba(8,9,8,0.45) 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 64,
          bottom: 56,
          fontFamily: T.sans,
          fontSize: 28,
          fontWeight: 550,
          color: T.ink,
          opacity: caption,
          letterSpacing: '0.02em',
          textShadow: '0 2px 12px rgba(0,0,0,0.55)',
        }}
      >
        午夜工作台 · 代码与对话同屏
      </div>
    </AbsoluteFill>
  );
};
