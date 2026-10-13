export type ProgressRange = {
  /** Document Y where progress = 0 */
  start: () => number;
  /** Document Y where progress = 1 */
  end: () => number;
  onUpdate: (t01: number) => void;
};

type Entry = ProgressRange & { last: number };

const entries: Entry[] = [];
let raf = 0;
let listening = false;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const measure = (entry: Entry) => {
  const a = entry.start();
  const b = entry.end();
  const span = b - a;
  if (span <= 0) return 0;
  return clamp01((window.scrollY - a) / span);
};

const flush = () => {
  raf = 0;
  for (const entry of entries) {
    const t = measure(entry);
    if (t === entry.last) continue;
    entry.last = t;
    entry.onUpdate(t);
  }
};

const schedule = () => {
  if (raf) return;
  raf = requestAnimationFrame(flush);
};

const ensureListeners = () => {
  if (listening) return;
  listening = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
};

/** Force re-measure + notify (e.g. after layout / font load). */
export function refresh() {
  for (const entry of entries) entry.last = Number.NaN;
  schedule();
}

/**
 * Bind a scroll-scrubbed 0→1 progress. Returns dispose.
 * Multiple ranges share one scroll/rAF loop.
 */
export function onScrollProgress(range: ProgressRange): () => void {
  const entry: Entry = { ...range, last: Number.NaN };
  entries.push(entry);
  ensureListeners();
  // Sync first paint
  entry.last = measure(entry);
  entry.onUpdate(entry.last);

  return () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  };
}
