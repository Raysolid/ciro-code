#!/usr/bin/env node
/**
 * Pi compatibility matrix placeholder (Phase 1).
 * Weekly CI can expand to install multiple pi minors and run harness-pi tests.
 *
 * Locked version: @earendil-works/pi-coding-agent =0.84.4
 */
const LOCKED = '0.84.4';
const CANDIDATES = [LOCKED]; // expand later: ['0.84.4', '0.85.0']

console.log(JSON.stringify({ locked: LOCKED, candidates: CANDIDATES, status: 'placeholder' }, null, 2));
