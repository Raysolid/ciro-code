import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, alpha, ramp} from '../lib/motion';

/** Scanline annotate on diff still — machine color #4FA98E */
const MACHINE = T.accentSoft;

type Target = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  head: string;
  detail: string;
  ft: number;
};

const SCAN0 = 8;
const SCAN1 = 110;
const Y0 = -10;
const Y1 = 980;

const scanY = (f: number) =>
  Y0 + (Y1 - Y0) * Math.min(1, Math.max(0, (f - SCAN0) / (SCAN1 - SCAN0)));

const TARGETS: Target[] = [
  {key: 'pending', x: 980, y: 120, w: 280, h: 52, head: '待确认', detail: '3 files', ft: 28},
  {key: 'file', x: 420, y: 280, w: 220, h: 48, head: 'main.js', detail: '+42 −8', ft: 52},
  {key: 'accept', x: 1180, y: 780, w: 260, h: 64, head: '接受全部', detail: 'Apply', ft: 88},
];

const Bracket: React.FC<{t: Target; frame: number}> = ({t, frame}) => {
  const f = frame - t.ft;
  if (f < 0) return null;
  const s = ramp(frame, t.ft, 12, EASE.overshoot);
  const pad = 48 * (1 - Math.min(1, s));
  const op = Math.min(1, f / 3);
  const arm = 36 - 10 * ramp(frame, t.ft + 3, 10, EASE.out);
  const flash = ramp(frame, t.ft + 2, 3, EASE.out) * (1 - ramp(frame, t.ft + 6, 12, EASE.out));
  const x = t.x - pad;
  const y = t.y - pad;
  const w = t.w + pad * 2;
  const h = t.h + pad * 2;
  const d = [
    `M${x} ${y + arm}V${y}H${x + arm}`,
    `M${x + w - arm} ${y}H${x + w}V${y + arm}`,
    `M${x + w} ${y + h - arm}V${y + h}H${x + w - arm}`,
    `M${x + arm} ${y + h}H${x}V${y + h - arm}`,
  ].join('');
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: t.x,
          top: t.y,
          width: t.w,
          height: t.h,
          borderRadius: 6,
          background: alpha(MACHINE, 0.08 * flash),
          boxShadow: `inset 0 0 0 2px ${alpha(MACHINE, 0.45 * flash)}`,
        }}
      />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: op}}>
        <path
          d={d}
          fill="none"
          stroke={MACHINE}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};

const Label: React.FC<{t: Target; frame: number}> = ({t, frame}) => {
  const s0 = t.ft + 5;
  if (frame < s0) return null;
  const rise = ramp(frame, s0, 10, EASE.out);
  const full = `${t.head} · ${t.detail}`;
  const typed = Math.min(full.length, Math.floor((frame - s0) * 2.2) + 1);
  return (
    <div
      style={{
        position: 'absolute',
        left: t.x + t.w + 14,
        top: t.y + (t.h - 40) / 2,
        height: 48,
        padding: '0 16px',
        borderRadius: 8,
        background: MACHINE,
        color: '#fff',
        fontFamily: T.mono,
        fontSize: 34,
        fontWeight: 650,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'pre',
        opacity: rise,
        transform: `translateY(${((1 - rise) * 8).toFixed(1)}px)`,
        boxShadow: `0 8px 20px -8px ${alpha('#0a3d32', 0.6)}`,
      }}
    >
      {full.slice(0, typed)}
      {typed < full.length && (
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 30,
            marginLeft: 2,
            background: 'rgba(255,255,255,0.85)',
          }}
        />
      )}
    </div>
  );
};

export const DiffScene: React.FC = () => {
  const frame = useCurrentFrame();
  const ly = scanY(frame);
  const lineOn = ramp(frame, SCAN0 - 3, 5, EASE.out) * (1 - ramp(frame, SCAN1, 10, EASE.exit));
  const push = 1 + 0.03 * ramp(frame, 0, 180, EASE.swift);
  const fired = TARGETS.filter((t) => frame >= t.ft).length;
  const statusIn = ramp(frame, 0, 10, EASE.out);

  return (
    <AbsoluteFill style={{background: T.bg, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${push.toFixed(5)})`,
          transformOrigin: '50% 50%',
        }}
      >
        <Img
          src={staticFile('media/diff.png')}
          style={{width: 1920, height: 1080, objectFit: 'cover'}}
        />
        {lineOn > 0.01 && (
          <>
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: 1920,
                top: ly - 120,
                height: 120,
                opacity: lineOn,
                background: `linear-gradient(180deg, ${alpha(MACHINE, 0)} 0%, ${alpha(MACHINE, 0.06)} 60%, ${alpha(MACHINE, 0.14)} 100%)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                width: 1920,
                top: ly - 1.5,
                height: 3,
                opacity: lineOn,
                background: MACHINE,
                boxShadow: 'none',
              }}
            />
          </>
        )}
        {TARGETS.map((t) => (
          <Bracket key={t.key} t={t} frame={frame} />
        ))}
        {TARGETS.map((t) => (
          <Label key={`l-${t.key}`} t={t} frame={frame} />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 48,
          top: 36,
          opacity: statusIn,
          fontFamily: T.mono,
          fontSize: 32,
          fontWeight: 600,
          color: MACHINE,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: MACHINE,
            opacity: 0.5 + 0.5 * Math.sin(frame / 4),
          }}
        />
        扫描变更 · {String(fired).padStart(2, '0')} / 03
      </div>
    </AbsoluteFill>
  );
};
