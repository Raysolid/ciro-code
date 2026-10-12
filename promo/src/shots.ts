/** Absolute timeline @30fps — single source of truth */
export const SHOTS = {
  brand: {from: 0, dur: 114},
  terminal: {from: 114, dur: 186},
  workbench: {from: 300, dur: 150},
  modes: {from: 450, dur: 165},
  diff: {from: 615, dur: 180},
  wipe: {from: 795, dur: 45},
  outro: {from: 840, dur: 240},
} as const;

export const TOTAL = 1080;
