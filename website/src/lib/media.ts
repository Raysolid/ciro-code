/** Landing-page media paths under `public/media/`. */
export function mediaPaths(base: string) {
  return {
    workbench: `${base}media/workbench.webp`,
    diff: `${base}media/diff.webp`,
    terminal: `${base}media/terminal.webp`,
    tour: `${base}media/tour.mp4`,
    tourPoster: `${base}media/tour-poster.webp`,
    modes: {
      Ask: `${base}media/mode-ask.webp`,
      Plan: `${base}media/mode-plan.webp`,
      Agent: `${base}media/mode-agent.webp`,
      Debug: `${base}media/mode-debug.webp`,
    },
  } as const;
}
