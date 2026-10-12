import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, alpha, mix, ramp} from '../lib/motion';

/** Single-window terminal: type `ciro web` → READY :3080 */
const CMD = 'ciro web';
const TYPE_AT = 10;
const WIN_W = 1180;
const WIN_H = 620;

const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const charTimes = (cmd: string) => {
  const out: number[] = [];
  let t = 0;
  for (let k = 0; k < cmd.length; k++) {
    out.push(t);
    t += 0.85 + rand(3 + k) * 0.95 + (cmd[k] === ' ' ? 0.5 : 0);
  }
  return {out, end: t};
};

const TYPING = charTimes(CMD);
const ENTER = TYPE_AT + TYPING.end + 2;
const OUT0 = ENTER + 3;
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

type Line = {at: number; mark?: boolean; segs: [string, string][]};

const LINES: Line[] = [
  {
    at: 0,
    mark: true,
    segs: [
      ['local      ', T.ink3],
      ['starting workbench', T.ink],
    ],
  },
  {
    at: 10,
    mark: true,
    segs: [
      ['server     ', T.ink3],
      ['http://127.0.0.1:3080', T.accentSoft],
    ],
  },
  {
    at: 20,
    segs: [
      ['Local server ready', T.ink],
    ],
  },
];

export const TerminalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = ramp(frame, 0, 18, EASE.out);
  const tf = frame - TYPE_AT;
  const n = TYPING.out.filter((x) => x <= tf).length;
  const typing = tf >= 0 && n < CMD.length;
  const caretOn =
    typing || Math.floor((frame - (tf < 0 ? 0 : TYPE_AT + TYPING.end)) / 8) % 2 === 0;
  const readyAt = OUT0 + 28;
  const ready = ramp(frame, readyAt, 14, EASE.overshoot);
  const push = 1 + 0.02 * ramp(frame, 150, 36, EASE.smooth);

  return (
    <AbsoluteFill style={{background: T.bgDeep, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 55% 50% at 50% 42%, ${alpha(T.accent, 0.1)} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 960 - WIN_W / 2,
          top: 540 - WIN_H / 2 - 20,
          width: WIN_W,
          height: WIN_H,
          borderRadius: 18,
          overflow: 'hidden',
          opacity: Math.min(1, settle * 1.4),
          transform: `translateY(${((1 - settle) * 40).toFixed(1)}px) scale(${(mix(0.96, 1, settle) * push).toFixed(4)})`,
          boxShadow: `0 40px 100px ${alpha('#000', 0.65)}, 0 0 0 1px ${alpha(T.accentSoft, 0.12)}`,
          background: `linear-gradient(180deg, #1e211d 0%, #151714 40%, #10120f 100%)`,
          fontFamily: T.mono,
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: '0 22px',
            gap: 10,
            borderBottom: `1px solid ${T.line}`,
            background: alpha('#fff', 0.03),
          }}
        >
          {[0, 1, 2].map((k) => (
            <div
              key={k}
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: alpha(T.ink, 0.18),
              }}
            />
          ))}
          <div style={{marginLeft: 18, fontSize: 18, color: T.ink3}}>~/ciro — zsh</div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 44,
            top: 100,
            fontSize: 42,
            fontWeight: 600,
            color: T.ink,
            whiteSpace: 'pre',
          }}
        >
          <span style={{color: T.accentSoft}}>❯ </span>
          {CMD.slice(0, Math.max(0, n))}
          {frame < ENTER + 1 && (
            <span
              style={{
                display: 'inline-block',
                width: '0.5em',
                height: '1.05em',
                marginLeft: 3,
                verticalAlign: '-0.12em',
                borderRadius: 2,
                background: T.accentSoft,
                opacity: caretOn ? 0.95 : 0,
              }}
            />
          )}
        </div>

        <div style={{position: 'absolute', left: 44, right: 44, top: 190}}>
          {LINES.map((ln, k) => {
            const p = ramp(frame, OUT0 + ln.at, 6, EASE.snappy);
            if (p <= 0) return null;
            const lt = frame - (OUT0 + ln.at);
            const spinning = ln.mark && lt < 8;
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: k * 58,
                  fontSize: 30,
                  fontWeight: 500,
                  whiteSpace: 'pre',
                  opacity: Math.min(1, p * 1.8),
                  transform: `translateX(${((1 - p) * -8).toFixed(1)}px)`,
                }}
              >
                {ln.mark && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1.5em',
                      color: spinning ? T.ink3 : T.accentSoft,
                    }}
                  >
                    {spinning ? SPIN[Math.floor(lt * 1.4) % SPIN.length] : '✓'}
                  </span>
                )}
                {ln.segs.map(([s, c], j) => (
                  <span key={j} style={{color: c}}>
                    {s}
                  </span>
                ))}
              </div>
            );
          })}

          {ready > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 3 * 58 + 20,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                opacity: Math.min(1, ready),
                transform: `scale(${mix(0.94, 1, ready).toFixed(4)})`,
                transformOrigin: 'left center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 48,
                  padding: '0 20px',
                  borderRadius: 10,
                  background: T.accent,
                  color: T.ink,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: T.ink,
                    opacity: 0.5 + 0.5 * Math.cos(Math.max(0, frame - readyAt) / 6),
                  }}
                />
                READY
              </div>
              <span style={{fontSize: 40, fontWeight: 700, color: T.accentSoft}}>
                :3080
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 72,
          textAlign: 'center',
          fontFamily: T.sans,
          fontSize: 26,
          fontWeight: 500,
          color: T.ink2,
          opacity: ramp(frame, readyAt + 8, 16, EASE.out),
        }}
      >
        一条命令，打开工作台
      </div>
    </AbsoluteFill>
  );
};
