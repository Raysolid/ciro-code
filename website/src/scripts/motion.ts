import { onScrollProgress, refresh as refreshScrollProgress } from './scroll-progress';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TILT = {
  rotateX: 12,
  y: 26,
  z: -36,
  perspective: 1600,
} as const;

function stickyHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function heroPointerFx() {
  const hero = document.querySelector<HTMLElement>('[data-hero-fx]');
  const canvas = hero?.querySelector<HTMLCanvasElement>('[data-hero-dots]');
  if (!hero || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const RADIUS = 150;
  const narrowMq = window.matchMedia('(max-width: 48rem)');
  const target = { x: -9999, y: -9999 };
  const current = { x: -9999, y: -9999 };
  let raf = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let gap = 22;
  let points: Array<{ x: number; y: number }> = [];
  let baseFill = '';
  const fillCache = new Map<number, string>();
  const glowCache = new Map<number, string>();

  const parseAccent = () => {
    const raw =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3d8bfd';
    const hex = raw.startsWith('#') ? raw.slice(1) : '3d8bfd';
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.padEnd(6, '0');
    return {
      r: Number.parseInt(full.slice(0, 2), 16) || 61,
      g: Number.parseInt(full.slice(2, 4), 16) || 139,
      b: Number.parseInt(full.slice(4, 6), 16) || 253,
    };
  };

  let accent = parseAccent();

  const rebuildStyles = () => {
    const { r, g, b } = accent;
    fillCache.clear();
    glowCache.clear();
    const baseStrength = 0.045;
    baseFill = `rgba(${r}, ${g}, ${b}, ${0.08 + baseStrength * 0.92})`;
    for (let i = 0; i <= 32; i += 1) {
      const strength = i / 32;
      fillCache.set(i, `rgba(${r}, ${g}, ${b}, ${0.08 + strength * 0.92})`);
      glowCache.set(i, `rgba(${r}, ${g}, ${b}, ${strength * 0.22})`);
    }
  };

  const rebuild = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    gap = narrowMq.matches ? 28 : 22;
    width = hero.clientWidth;
    height = hero.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    accent = parseAccent();
    rebuildStyles();

    points = [];
    const cols = Math.ceil(width / gap) + 1;
    const rows = Math.ceil(height / gap) + 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        points.push({ x: col * gap, y: row * gap });
      }
    }
  };

  let visible = true;
  let running = false;

  const paintDot = (x: number, y: number, strength: number) => {
    const bucket = Math.max(0, Math.min(32, Math.round(strength * 32)));
    const radius = 0.9 + strength * 1.7;
    ctx.fillStyle = strength <= 0.05 ? baseFill : (fillCache.get(bucket) ?? baseFill);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (strength > 0.55) {
      ctx.fillStyle = glowCache.get(bucket) ?? baseFill;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const paintFrame = () => {
    current.x += (target.x - current.x) * 0.16;
    current.y += (target.y - current.y) * 0.16;

    ctx.clearRect(0, 0, width, height);
    const active = current.x > -1000 && current.y > -1000;

    if (active) {
      const cx = current.x;
      const cy = current.y;
      for (const p of points) {
        const dx = p.x - cx;
        if (dx >= RADIUS || dx <= -RADIUS) continue;
        const dy = p.y - cy;
        if (dy >= RADIUS || dy <= -RADIUS) continue;
        const dist = Math.hypot(dx, dy);
        if (dist >= RADIUS) continue;
        const t = 1 - dist / RADIUS;
        paintDot(p.x, p.y, 0.04 + t * t * 0.96);
      }
    } else {
      for (const p of points) paintDot(p.x, p.y, 0.045);
    }

    const settling =
      !active && Math.abs(current.x - target.x) < 0.5 && Math.abs(current.y - target.y) < 0.5;
    if (!visible || settling) {
      running = false;
      raf = 0;
      return;
    }

    raf = requestAnimationFrame(paintFrame);
  };

  const kick = () => {
    if (!visible || running) return;
    running = true;
    raf = requestAnimationFrame(paintFrame);
  };

  const onMove = (e: PointerEvent) => {
    const rect = hero.getBoundingClientRect();
    target.x = e.clientX - rect.left;
    target.y = e.clientY - rect.top;
    kick();
  };

  const onLeave = () => {
    target.x = -9999;
    target.y = -9999;
    kick();
  };

  const onResize = () => {
    rebuild();
    kick();
  };

  rebuild();
  paintFrame();
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', onResize, { passive: true });

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        running = false;
      }
    },
    { threshold: 0.05 },
  );
  io.observe(hero);
}

function scrollReveals() {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
    (el) => el.id !== 'hero' && !el.parentElement?.closest('[data-reveal]'),
  );

  if (!nodes.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add('is-in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -15% 0px', threshold: 0.08 },
  );

  nodes.forEach((el) => io.observe(el));
}

function applyTilt(frame: HTMLElement, tiltAmount: number) {
  // tiltAmount 1 = 后倾最大，0 = 正对
  const t = Math.max(0, Math.min(1, tiltAmount));
  const rotateX = TILT.rotateX * t;
  const y = TILT.y * t;
  const z = TILT.z * t;
  frame.style.transform = `perspective(${TILT.perspective}px) rotateX(${rotateX}deg) translate3d(0, ${y}px, ${z}px)`;
  frame.classList.toggle('is-tilting', t > 0.02 && t < 0.98);
}

function demoTilt() {
  const stage = document.querySelector<HTMLElement>('[data-demo-tilt]');
  const frame = stage?.querySelector<HTMLElement>('.product-demo__frame');
  const heroStage = document.querySelector<HTMLElement>('.hero-stage');
  if (!stage || !frame) return;

  frame.style.transformOrigin = 'center top';

  if (reduceMotion()) {
    applyTilt(frame, 0);
    return;
  }

  // 首帧即后倾（与 CSS 默认一致），避免闪正
  applyTilt(frame, 1);

  const docY = (el: HTMLElement, localY: number) =>
    window.scrollY + el.getBoundingClientRect().top + localY;

  onScrollProgress({
    start: () => {
      const root = heroStage ?? stage;
      return docY(root, 0);
    },
    end: () => {
      const rect = stage.getBoundingClientRect();
      return window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
    },
    onUpdate: (t01) => applyTilt(frame, 1 - t01),
  });
}

/** 粘性叠切：滚动切换面板，浮现后再播一次场景 */
function modesStickyFade() {
  const track = document.querySelector<HTMLElement>('[data-modes-track]');
  if (!track) return;

  const panels = [...track.querySelectorAll<HTMLElement>('[data-modes-panel]')];
  const count = panels.length;
  if (!count) return;

  let current = -1;
  let emergeHandler: ((e: AnimationEvent) => void) | null = null;
  let playHandler: ((e: AnimationEvent) => void) | null = null;
  let visible = false;

  const sceneOf = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[data-mode-scene]');

  const clearListeners = (panel: HTMLElement) => {
    const copy = panel.querySelector<HTMLElement>('.modes-hl__copy');
    const scene = sceneOf(panel);
    if (emergeHandler && copy) copy.removeEventListener('animationend', emergeHandler);
    if (playHandler && scene) {
      const steps = scene.querySelectorAll('.mode-scene__step');
      const last = steps[steps.length - 1];
      if (last) last.removeEventListener('animationend', playHandler);
    }
    emergeHandler = null;
    playHandler = null;
  };

  const resetScene = (scene: HTMLElement | null) => {
    if (!scene) return;
    scene.classList.remove('is-playing', 'is-done', 'is-paused');
  };

  const markDone = (scene: HTMLElement) => {
    scene.classList.add('is-done');
    scene.classList.remove('is-playing', 'is-paused');
  };

  const startPlaying = (panel: HTMLElement) => {
    if (!visible || panels[current] !== panel) return;
    const scene = sceneOf(panel);
    if (!scene) return;

    if (reduceMotion()) {
      markDone(scene);
      return;
    }

    scene.classList.remove('is-done', 'is-paused');
    scene.classList.add('is-playing');

    const steps = [...scene.querySelectorAll<HTMLElement>('.mode-scene__step')];
    const lastStep = steps[steps.length - 1];
    if (!lastStep) {
      markDone(scene);
      return;
    }

    playHandler = (e: AnimationEvent) => {
      if (e.target !== lastStep || e.animationName !== 'mode-seg-once') return;
      if (playHandler) lastStep.removeEventListener('animationend', playHandler);
      playHandler = null;
      markDone(scene);
    };
    lastStep.addEventListener('animationend', playHandler);
  };

  const restartEmerge = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  };

  const startEmerging = (panel: HTMLElement) => {
    clearListeners(panel);
    const scene = sceneOf(panel);
    resetScene(scene);

    if (!panel.classList.contains('is-active')) {
      void panel.offsetWidth;
      panel.classList.add('is-active');
    }
    panel.classList.add('is-emerging');

    if (reduceMotion()) {
      panel.classList.remove('is-emerging');
      if (scene) markDone(scene);
      return;
    }

    const copy = panel.querySelector<HTMLElement>('.modes-hl__copy');
    const visual = panel.querySelector<HTMLElement>('.modes-hl__visual');
    const waitEl = copy ?? visual;
    if (!waitEl) {
      startPlaying(panel);
      return;
    }

    restartEmerge(visual);
    restartEmerge(copy);

    emergeHandler = (e: AnimationEvent) => {
      if (e.animationName !== 'modes-emerge') return;
      if (copy && e.target !== copy) return;
      if (!copy && visual && e.target !== visual) return;
      if (emergeHandler) waitEl.removeEventListener('animationend', emergeHandler);
      emergeHandler = null;
      panel.classList.remove('is-emerging');
      startPlaying(panel);
    };
    waitEl.addEventListener('animationend', emergeHandler);
  };

  const setIndex = (index: number) => {
    const i = Math.max(0, Math.min(count - 1, index));
    if (i === current) return;
    current = i;

    panels.forEach((panel, idx) => {
      const on = idx === i;
      clearListeners(panel);
      panel.classList.remove('is-active', 'is-emerging');
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
      resetScene(sceneOf(panel));
      if (on) {
        void panel.offsetWidth;
        panel.classList.add('is-active');
      }
    });

    const active = panels[i];
    if (!active || !visible) return;
    startEmerging(active);
  };

  setIndex(0);

  const io = new IntersectionObserver(
    ([entry]) => {
      const on = Boolean(entry?.isIntersecting);
      const was = visible;
      visible = on;

      if (!on) {
        const scene = panels[current] ? sceneOf(panels[current]!) : null;
        if (scene?.classList.contains('is-playing')) {
          scene.classList.add('is-paused');
          scene.classList.remove('is-playing');
        }
        panels[current]?.classList.remove('is-emerging');
        return;
      }

      if (!was) {
        const panel = panels[current];
        if (!panel) return;
        const scene = sceneOf(panel);
        if (scene?.classList.contains('is-done')) return;
        startEmerging(panel);
      }
    },
    { threshold: 0.08 },
  );
  io.observe(track);

  if (reduceMotion()) return;

  onScrollProgress({
    start: () => window.scrollY + track.getBoundingClientRect().top,
    end: () => {
      const rect = track.getBoundingClientRect();
      return window.scrollY + rect.top + rect.height - window.innerHeight;
    },
    onUpdate: (t01) => {
      const idx = Math.min(count - 1, Math.floor(t01 * count + 0.001));
      setIndex(idx);
    },
  });
}

export function initMotion() {
  stickyHeader();
  modesStickyFade();

  if (reduceMotion()) {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      el.classList.add('is-in');
    });
    demoTilt();
    return;
  }

  heroPointerFx();
  scrollReveals();
  demoTilt();

  // 布局稳定后再校正进度边界
  requestAnimationFrame(() => refreshScrollProgress());
  window.addEventListener('load', () => refreshScrollProgress(), { once: true });
}

initMotion();
