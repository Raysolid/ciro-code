import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, bezier, ramp} from '../lib/motion';

/** Letterspace materialize — CIRO uppercase on flat Midnight bg */
const GLYPHS: Record<string, {w: number; d: string}> = {
  C: {w: 58, d: 'M 48 14 A 24 24 0 1 0 48 50'},
  I: {w: 22, d: 'M 4 10 L 18 10 M 11 10 L 11 54 M 4 54 L 18 54'},
  R: {w: 54, d: 'M 8 10 L 8 54 M 8 10 L 34 10 A 14 14 0 0 1 34 34 L 8 34 M 28 34 L 48 54'},
  O: {w: 58, d: 'M 29 10 A 24 24 0 1 1 29 58 A 24 24 0 1 1 29 10'},
};

const WORD = 'CIRO';
const SCALE = 2.6;
const TRACK = 48;
const START = 16;
const DUR = 52;
const strokeEase = bezier(0.5, 0, 0.3, 1);
const MARK_Y = 500;
const GH = 64 * SCALE;

const Word: React.FC<{e: number}> = ({e}) => (
  <div style={{display: 'flex', gap: TRACK, alignItems: 'center'}}>
    {WORD.split('').map((ch, i) => {
      const g = GLYPHS[ch];
      return (
        <svg
          key={i}
          width={g.w * SCALE}
          height={GH}
          viewBox={`0 0 ${g.w} 64`}
          style={{overflow: 'visible', display: 'block'}}
        >
          {e > 0 && (
            <path
              d={g.d}
              fill="none"
              stroke={T.ink}
              strokeWidth={4.2 / SCALE}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - e}
            />
          )}
        </svg>
      );
    })}
  </div>
);

export const BrandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const e = ramp(frame, START, DUR, strokeEase);
  const caption = ramp(frame, START + DUR + 4, 18, EASE.out);

  return (
    <AbsoluteFill style={{background: T.bg, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 60% at 50% 45%, rgba(15,107,87,0.07) 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: MARK_Y - GH / 2,
          height: GH,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Word e={e} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: MARK_Y + GH / 2 + 36,
          textAlign: 'center',
          fontFamily: T.sans,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '0.28em',
          color: T.ink3,
          opacity: caption,
        }}
      >
        CODE
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 72% 72% at 50% 48%, transparent 42%, rgba(8,9,8,0.55) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
