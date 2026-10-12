import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, alpha, mix, ramp} from '../lib/motion';

/** Three-segment Ask → Plan → Agent with two thumb slides (8f ease-out each) */
const LABELS = ['Ask', 'Plan', 'Agent'] as const;
const STILLS = ['media/mode-ask.png', 'media/mode-plan.png', 'media/mode-agent.png'] as const;

const CW = 960;
const CH = 96;
const PAD = 8;
const SEGW = (CW - PAD * 2) / 3;
const TH = CH - PAD * 2;

// Local timeline
const FLOAT = 0;
const CLICK1 = 36;
const SLIDE1 = 40; // → 48
const CLICK2 = 88;
const SLIDE2 = 92; // → 100

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const slideAmt = (frame: number, start: number) =>
  interpolate(frame, [start, start + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutCubic,
  });

const ArrowCursor: React.FC<{x: number; y: number; press: number; op: number}> = ({
  x,
  y,
  press,
  op,
}) => (
  <svg
    width={90}
    height={104}
    viewBox="0 0 26 30"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      opacity: op,
      transform: `scale(${1 - press * 0.14})`,
      transformOrigin: '15% 10%',
      filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
      zIndex: 20,
    }}
  >
    <path
      d="M4 2 L4 24 L9.5 18.5 L13 27 L16.8 25.4 L13.3 17 L21 17 Z"
      fill="#fff"
      stroke="#1a1a18"
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </svg>
);

export const ModesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const floatT = ramp(frame, FLOAT, 16, EASE.out);
  const s1 = slideAmt(frame, SLIDE1);
  const s2 = slideAmt(frame, SLIDE2);
  // thumb index 0→1→2
  const thumbIdx = s1 + s2;
  const thumbX = PAD + thumbIdx * SEGW;

  const press1 = interpolate(frame, [CLICK1, CLICK1 + 3, CLICK1 + 7], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const press2 = interpolate(frame, [CLICK2, CLICK2 + 3, CLICK2 + 7], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const press = Math.max(press1, press2);

  // cursor: first to Plan, then to Agent
  const curPhase = frame < CLICK2 - 20 ? 0 : 1;
  const curStart = curPhase === 0 ? 14 : CLICK2 - 22;
  const curT = ramp(frame, curStart, 18, EASE.swift);
  const targetX =
    curPhase === 0
      ? 960 - CW / 2 + PAD + SEGW * 1.5 - 20
      : 960 - CW / 2 + PAD + SEGW * 2.5 - 20;
  const fromX = curPhase === 0 ? 1680 : targetX + 80;
  const curX = mix(fromX, targetX, curT);
  const curY = mix(curPhase === 0 ? 980 : 620, 560, curT);
  const showCur =
    (frame >= 12 && frame < SLIDE1 + 14) || (frame >= CLICK2 - 24 && frame < SLIDE2 + 16);
  const curOp = showCur
    ? frame >= CLICK2 - 24
      ? ramp(frame, CLICK2 - 24, 8, EASE.out)
      : ramp(frame, 12, 10, EASE.out)
    : 0;

  // still crossfade: ask→plan→agent
  const askOp = 1 - s1;
  const planOp = s1 * (1 - s2);
  const agentOp = s2;

  const ctrlY = 540;
  const caption = ramp(frame, 8, 16, EASE.out);

  return (
    <AbsoluteFill style={{background: T.bg, overflow: 'hidden'}}>
      {[askOp, planOp, agentOp].map((op, i) =>
        op > 0.01 ? (
          <Img
            key={i}
            src={staticFile(STILLS[i])}
            style={{
              position: 'absolute',
              inset: 0,
              width: 1920,
              height: 1080,
              objectFit: 'cover',
              opacity: op,
            }}
          />
        ) : null,
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, rgba(14,15,14,0.35) 0%, rgba(14,15,14,0.15) 40%, rgba(14,15,14,0.55) 100%)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 960 - CW / 2,
          top: ctrlY - CH / 2,
          width: CW,
          height: CH,
          borderRadius: CH / 2,
          background: 'linear-gradient(180deg, #252724 0%, #1a1c19 100%)',
          border: `1px solid ${T.line}`,
          boxShadow: `inset 0 2px 6px rgba(0,0,0,0.35), 0 18px 48px -12px rgba(0,0,0,0.55)`,
          opacity: Math.min(1, floatT * 1.5),
          transform: `translateY(${((1 - floatT) * 40).toFixed(1)}px)`,
          display: 'flex',
          alignItems: 'center',
          padding: PAD,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: thumbX,
            top: PAD,
            width: SEGW,
            height: TH,
            borderRadius: TH / 2,
            background: `linear-gradient(180deg, ${T.accentSoft} 0%, ${T.accent} 100%)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 8px ${alpha('#000', 0.35)}`,
            zIndex: 1,
          }}
        />
        {LABELS.map((label, i) => {
          const active = Math.abs(thumbIdx - i) < 0.55;
          return (
            <div
              key={label}
              style={{
                width: SEGW,
                height: TH,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 2,
                fontFamily: T.sans,
                fontWeight: 650,
                fontSize: 34,
                letterSpacing: '-0.02em',
                color: active ? T.ink : T.ink3,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>

      <ArrowCursor x={curX} y={curY} press={press} op={curOp} />

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 64,
          textAlign: 'center',
          fontFamily: T.sans,
          fontSize: 48,
          fontWeight: 500,
          color: T.ink2,
          opacity: caption,
        }}
      >
        一键切换 · Ask / Plan / Agent
      </div>
    </AbsoluteFill>
  );
};
