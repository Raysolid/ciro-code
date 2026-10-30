import { describe, it, expect } from 'vitest';
import { ContextAccountant } from './context-accountant.js';

describe('ContextAccountant', () => {
  it('builds snapshot with rules bucket and usageRatio', () => {
    const acct = new ContextAccountant({
      modelContextLimit: 1000,
      reservedOutputTokens: 100,
    });
    const snap = acct.refresh('s1', {
      system: 'a'.repeat(400), // ~100 tokens
      tools: 'b'.repeat(200), // ~50
      conversation: 'c'.repeat(800), // ~200
      memory: 'm'.repeat(40),
      rules: 'r'.repeat(40),
    });
    expect(snap.sessionId).toBe('s1');
    expect(snap.estimated).toBe(true);
    expect(snap.effectiveLimit).toBe(900);
    expect(snap.buckets.map((b) => b.id)).toEqual([
      'system',
      'tools',
      'memory',
      'rules',
      'skills',
      'mcp',
      'subagents',
      'conversation',
      'summarized',
    ]);
    expect(snap.buckets.find((b) => b.id === 'skills')?.tokens).toBe(0);
    expect(snap.buckets.find((b) => b.id === 'rules')?.tokens).toBeGreaterThan(0);
    expect(snap.totalTokens).toBeGreaterThan(0);
    expect(snap.usageRatio).toBeCloseTo(snap.totalTokens / 900, 5);
    expect(acct.get('s1')).toEqual(snap);
  });

  it('uses per-session limit override', () => {
    const acct = new ContextAccountant({
      modelContextLimit: 1000,
      reservedOutputTokens: 0,
    });
    acct.setSessionLimit('s1', 500);
    const snap = acct.refresh('s1', { conversation: 'x'.repeat(40) });
    expect(snap.modelContextLimit).toBe(500);
    expect(snap.effectiveLimit).toBe(500);
  });

  it('urgency follows thresholds from same ratio', () => {
    const acct = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: {
        mode: 'auto',
        thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
        maxConsecutiveFailures: 3,
      },
    });
    acct.refresh('s', {
      system: 'x'.repeat(80), // 20 tokens → 0.2
      conversation: '',
    });
    expect(acct.getCompactUrgency('s')).toBe('none');

    acct.refresh('s', {
      system: 'x'.repeat(240), // 60 tokens → 0.6
      conversation: '',
    });
    expect(acct.getCompactUrgency('s')).toBe('background');

    acct.refresh('s', {
      system: 'x'.repeat(400), // 100 → 1.0
      conversation: '',
    });
    expect(acct.getCompactUrgency('s')).toBe('required');
  });

  it('folds toolPayloadTokens into conversation bucket', () => {
    const acct = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
    });
    const base = acct.refresh('s', { conversation: 'x'.repeat(40) }); // ~10 tokens
    const withTools = acct.refresh('s', {
      conversation: 'x'.repeat(40),
      toolPayloadTokens: 40,
    });
    expect(withTools.totalTokens).toBe(base.totalTokens + 40);
    expect(
      withTools.buckets.find((b) => b.id === 'conversation')?.tokens,
    ).toBe((base.buckets.find((b) => b.id === 'conversation')?.tokens ?? 0) + 40);
    expect(withTools.usageRatio).toBeGreaterThan(base.usageRatio);
  });
});
