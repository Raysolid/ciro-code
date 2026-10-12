# Ciro Code Tour Promo — Design Spec

## Approved brief (locked)

| Item | Value |
|------|--------|
| Mode | Co-creation approved |
| Audio | SFX only (NO BGM) |
| Spec | 1920×1080 @ 30fps · 1080 frames (36s) |
| Skin | Midnight workbench · bg `#161715` · accent `#0F6B57` / `#4FA98E` |
| Paper text | white / off-white |
| Forbidden | purple gradients · decorative glint/glow spam |
| CTA | `ciro web` |
| Language | Chinese short captions · Chinese UI in stills |
| Composition | `CiroTour` |
| Deliverables | `out/tour.mp4` → `website/public/media/tour.mp4` · `tour-poster.webp` |

## Shot mapping (SHOTS)

| id | from | dur | Scene | Shotcraft reference |
|----|------|-----|-------|---------------------|
| brand | 0 | 114 | Letterspace CIRO | letterspace-materialize |
| terminal | 114 | 186 | `ciro web` → READY :3080 | terminal-3d (simplified 1 window) |
| workbench | 300 | 150 | Push-in 1.0→1.12 | PageCam / depth-layer push |
| modes | 450 | 165 | Ask→Plan→Agent · 2 thumb slides | segmented-thumb-hero |
| diff | 615 | 180 | Scanline annotate | scanline-annotate-focus |
| wipe | 795 | 45 | Dark soft-edge wipe | invisible-cut (dark only) |
| outro | 840 | 240 | Input morph → CIRO + CTA | ui-to-brand-morph |

**TOTAL = 1080 frames**

## Tokens

See `src/tokens.ts`. Accent used sparingly (prompt caret, READY pill, thumb, scanline, CTA).

## Stills

Converted cover-crop to `public/media/*.png` @ 1920×1080 from `website/public/media/*.webp`.

## SFX

Copied from video-shotcraft `assets/audio/sfx/`. Cue table in `src/SfxTrack.tsx` uses `SHOTS.*.from + N`. Outro sentence: riser → impact → one sparkle.

## Render

```bash
cd ciro-code/promo
npm install
npx remotion render src/index.ts CiroTour out/tour.mp4 --codec=h264
```

Target ≤8MB (crf ~28–32). Poster from brand hold or workbench frame.
