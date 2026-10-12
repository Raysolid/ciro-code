import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {T} from '../tokens';
import {EASE, alpha, mix, ramp} from '../lib/motion';

/**
 * Composer "随时提问..." → morph to CIRO wordmark + `ciro web` CTA.
 * Dark skin; sage accent sparingly; no amber cut geometry.
 */
const BOX = {x: 960, y: 620, w: 920, h: 110, r: 28};
const PLACEHOLDER = '随时提问...';
const MORPH = 48;
const WORD = 90;
const CTA = 130;

export const OutroScene: React.FC = () => {
  const f = useCurrentFrame();
  const inT = ramp(f, 0, 18, EASE.out);
  const m = ramp(f, MORPH, 36, EASE.swift);
  const flood = ramp(f, MORPH - 4, 16, EASE.snappy);

  const bx = mix(BOX.x, 960, m);
  const by = mix(BOX.y, 460, m);
  const bw = mix(BOX.w, 520, m);
  const bh = mix(BOX.h, 120, m);
  const br = mix(BOX.r, 16, m);

  const uiOut = Math.min(1, m * 2.2);
  const wordOp = ramp(f, WORD, 22, EASE.out);
  const ctaOp = ramp(f, CTA, 18, EASE.out);
  const push = 1 + 0.025 * ramp(f, 160, 80, EASE.smooth);
  const caret = f < MORPH && Math.floor(f / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{background: T.bg, overflow: 'hidden', fontFamily: T.sans}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 55% 45% at 50% 42%, ${alpha('#2a2a28', 0.9)} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${push.toFixed(5)})`,
          transformOrigin: '50% 45%',
          opacity: inT,
        }}
      >
        {/* morphing box */}
        <div
          style={{
            position: 'absolute',
            left: bx - bw / 2,
            top: by - bh / 2,
            width: bw,
            height: bh,
            borderRadius: br,
            overflow: 'hidden',
            background: flood >= 1 ? T.surface2 : T.surface,
            border: `1px solid ${alpha('#fff', mix(0.1, 0.06, m))}`,
            boxShadow: `0 0 0 ${(2.5 * (1 - flood)).toFixed(2)}px ${alpha(T.accentSoft, 0.55 * (1 - flood))}, 0 24px 60px -20px rgba(0,0,0,0.55)`,
          }}
        >
          {flood < 1 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                clipPath: `circle(${(flood * Math.hypot(bw, bh)).toFixed(1)}px at ${(bw - 56).toFixed(1)}px ${(bh / 2).toFixed(1)}px)`,
                background: T.surface2,
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              left: 36,
              top: 0,
              height: BOX.h,
              display: 'flex',
              alignItems: 'center',
              fontSize: 36,
              fontWeight: 450,
              color: T.ink3,
              opacity: 1 - uiOut,
              whiteSpace: 'nowrap',
            }}
          >
            {PLACEHOLDER}
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 40,
                marginLeft: 4,
                background: T.accentSoft,
                opacity: caret ? 1 : 0,
              }}
            />
          </div>
          <div
            style={{
              position: 'absolute',
              right: 18,
              top: (BOX.h - 72) / 2,
              width: 72,
              height: 72,
              borderRadius: 36,
              background: T.accent,
              opacity: 1 - uiOut,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4}>
              <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* CIRO wordmark */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 390,
            textAlign: 'center',
            fontSize: 120,
            fontWeight: 750,
            letterSpacing: '0.22em',
            color: T.ink,
            opacity: wordOp,
            transform: `translateY(${((1 - wordOp) * 24).toFixed(1)}px)`,
            paddingLeft: '0.22em',
          }}
        >
          CIRO
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 530,
            textAlign: 'center',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: '0.35em',
            color: T.ink3,
            opacity: wordOp * 0.9,
            paddingLeft: '0.35em',
          }}
        >
          CODE
        </div>

        {/* CTA */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 640,
            display: 'flex',
            justifyContent: 'center',
            opacity: ctaOp,
            transform: `translateY(${((1 - ctaOp) * 16).toFixed(1)}px)`,
          }}
        >
          <div
            style={{
              height: 72,
              padding: '0 40px',
              borderRadius: 36,
              background: T.accent,
              color: T.ink,
              fontFamily: T.mono,
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: `0 6px 16px -8px ${alpha('#000', 0.55)}`,
            }}
          >
            <span style={{opacity: 0.7}}>❯</span>
            ciro web
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 70% 70% at 50% 45%, transparent 48%, rgba(8,9,8,0.5) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
