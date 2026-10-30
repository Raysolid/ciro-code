import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextAccountant } from '../context/context-accountant.js';
import { DEFAULT_COMPACTION_CONFIG } from '@ciro-code/harness-shared';
import { ToolResultStore, buildPreview } from './tool-result-store.js';
import { runMicroCompact } from './micro-compact.js';
import {
  appendSessionNote,
  readSessionMemory,
  runSessionMemoryCompact,
} from './session-memory.js';
import { CompactionOrchestrator } from './orchestrator.js';
import {
  buildCompactedSeedMessages,
  parseConversationText,
} from './build-compacted-seed.js';
import { createStubFullCompactSummarizer } from './full-compact-summarizer.js';
import { runFullCompact, normalizeCompactionSummaryMarkdown } from './full-compact.js';
import { sliceRecentConversation } from './slice-recent.js';
import {
  resolveCompactionBiasEffects,
  effectiveCompactionThresholds,
} from './bias-effects.js';

describe('sliceRecentConversation', () => {
  it('returns short text unchanged', () => {
    expect(sliceRecentConversation('User: hi\n', 100)).toBe('User: hi\n');
  });

  it('snaps to message boundary instead of mid-line', () => {
    const early = 'User: ' + 'E'.repeat(200) + '\nAssistant: mid\n';
    const recent = 'User: KEEP_ME\nAssistant: ok\n';
    const text = early + recent;
    const out = sliceRecentConversation(text, recent.length + 10);
    expect(out.startsWith('User: KEEP_ME') || out.includes('User: KEEP_ME')).toBe(true);
    expect(out).not.toMatch(/^E+/);
    const msgs = parseConversationText(out);
    expect(msgs.some((m) => m.content.includes('KEEP_ME'))).toBe(true);
  });
});

describe('buildCompactedSeedMessages', () => {
  it('micro uses ui text messages only', () => {
    const seed = buildCompactedSeedMessages({
      method: 'micro',
      uiMessages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: 'world' },
      ],
    });
    expect(seed).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ]);
  });

  it('session-memory injects summary then recent conversation', () => {
    const seed = buildCompactedSeedMessages({
      method: 'session-memory',
      summarizedText: '## Session memory (compacted)\n\n- used Redis',
      conversationText: 'User: keep me\nAssistant: ok\n',
      uiMessages: [{ role: 'user', content: 'old full ui should be ignored' }],
    });
    expect(seed[0]?.role).toBe('user');
    expect(seed[0]?.content).toContain('Session memory');
    expect(seed[0]?.content).toContain('Redis');
    expect(seed.slice(1)).toEqual([
      { role: 'user', content: 'keep me' },
      { role: 'assistant', content: 'ok' },
    ]);
  });

  it('wraps plain summarized text with Compaction summary heading', () => {
    const seed = buildCompactedSeedMessages({
      method: 'full',
      summarizedText: 'decided X',
      conversationText: '',
    });
    expect(seed).toHaveLength(1);
    expect(seed[0]?.content).toMatch(/^# Compaction summary\n/);
    expect(seed[0]?.content).toContain('decided X');
  });

  it('resume path: summarizedText alone selects summarized seed', () => {
    const seed = buildCompactedSeedMessages({
      summarizedText: '# Compaction summary\n\nalready titled',
      conversationText: 'User: tail\n',
    });
    expect(seed).toHaveLength(2);
    expect(seed[0]?.content).toBe('# Compaction summary\n\nalready titled');
    expect(seed[1]).toEqual({ role: 'user', content: 'tail' });
  });
});

describe('parseConversationText', () => {
  it('skips headers and keeps multiline bodies', () => {
    const msgs = parseConversationText(
      '## Recent conversation\nUser: line1\nline2\nAssistant: reply\n',
    );
    expect(msgs).toEqual([
      { role: 'user', content: 'line1\nline2' },
      { role: 'assistant', content: 'reply' },
    ]);
  });
});

describe('buildPreview', () => {
  it('keeps bash tail and read head/tail', () => {
    const bash = 'line\n'.repeat(50) + 'EXIT_OK';
    expect(buildPreview('bash', bash)).toContain('EXIT_OK');
    const read = Array.from({ length: 80 }, (_, i) => `L${i}_${'x'.repeat(8)}`).join('\n');
    const p = buildPreview('read', read);
    expect(p).toContain('L0_');
    expect(p).toContain('…');
    expect(p).toContain('L79_');
  });
});

describe('micro-compact', () => {
  it('externalizes old tool results under 50ms', () => {
    const dir = mkdtempSync(join(tmpdir(), 'micro-'));
    const store = new ToolResultStore(dir);
    const big = 'x'.repeat(2000);
    const toolResults = [
      { toolCallId: 't1', toolName: 'read', content: big },
      { toolCallId: 't2', toolName: 'bash', content: big },
      { toolCallId: 't3', toolName: 'grep', content: 'keep-recent' },
    ];
    const out = runMicroCompact({
      sessionId: 's',
      mode: 'ask',
      toolResults,
      keepRecentInline: 1,
      store,
    });
    expect(out.elapsedMs).toBeLessThan(50);
    expect(out.result.metadata.method).toBe('micro');
    expect(out.result.metadata.tokensSaved).toBeGreaterThan(0);
    expect(out.toolResults[0]?.externalized).toBe(true);
    expect(existsSync(join(dir, 'tool-results', 't1.json'))).toBe(true);
    const disk = JSON.parse(readFileSync(join(dir, 'tool-results', 't1.json'), 'utf-8')) as {
      content: string;
      retention: string;
    };
    expect(disk.retention).toBe('pointer');
    expect(disk.content.length).toBe(2000);
  });
});

describe('session-memory', () => {
  it('appends notes and SM-compacts conversation', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'sm-'));
    appendSessionNote(workspace, { role: 'user', summary: 'Ask about Redis' });
    appendSessionNote(workspace, { role: 'assistant', summary: 'Explained cache layer' });
    expect(readSessionMemory(workspace)).toContain('Redis');

    const longConv = 'early history '.repeat(500) + 'RECENT_TAIL';
    const out = runSessionMemoryCompact({
      workspace,
      mode: 'agent',
      conversationText: longConv,
      keepRecentTokens: 100,
    });
    expect(out.summarizedText).toContain('Session memory');
    expect(out.conversationText).toContain('RECENT_TAIL');
    expect(out.result.metadata.tokensSaved).toBeGreaterThan(0);
  });
});

describe('compactionBias', () => {
  it('resolveCompactionBiasEffects maps three biases', () => {
    expect(resolveCompactionBiasEffects('aggressive').thresholdDelta).toBe(0.05);
    expect(resolveCompactionBiasEffects('normal').thresholdDelta).toBe(0);
    expect(resolveCompactionBiasEffects('retain-tool-results')).toMatchObject({
      keepRecentInline: 6,
      minTokensToExternalize: 200,
    });
  });

  it('aggressive urgency fires earlier than normal at same ratio', () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      // defaults bg 0.65 → aggressive bg 0.60
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    // ~62 tokens → ratio 0.62（介于 0.60 与 0.65）
    ctx.refresh('s', { conversation: 'x'.repeat(248) });
    expect(ctx.getCompactUrgency('s', 'normal')).toBe('none');
    expect(ctx.getCompactUrgency('s', 'aggressive')).toBe('background');
    const orch = new CompactionOrchestrator(cfg, ctx);
    expect(orch.decideAutoAction('s', 'normal').action).toBe('none');
    expect(orch.decideAutoAction('s', 'aggressive').action).toBe('micro');
  });

  it('retain-tool-results micro externalizes fewer than normal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bias-micro-'));
    const store = new ToolResultStore(dir);
    const big = 'PAYLOAD'.repeat(80); // >> 200 tokens
    const toolResults = Array.from({ length: 8 }, (_, i) => ({
      toolCallId: `t${i}`,
      toolName: 'bash',
      content: big,
    }));
    const normalFx = resolveCompactionBiasEffects('normal');
    const debugFx = resolveCompactionBiasEffects('retain-tool-results');
    const normalOut = runMicroCompact({
      sessionId: 's',
      mode: 'agent',
      toolResults: toolResults.map((r) => ({ ...r })),
      store,
      keepRecentInline: normalFx.keepRecentInline,
      minTokensToExternalize: normalFx.minTokensToExternalize,
    });
    const debugOut = runMicroCompact({
      sessionId: 's2',
      mode: 'debug',
      toolResults: toolResults.map((r) => ({ ...r })),
      store: new ToolResultStore(mkdtempSync(join(tmpdir(), 'bias-micro-d-'))),
      keepRecentInline: debugFx.keepRecentInline,
      minTokensToExternalize: debugFx.minTokensToExternalize,
    });
    expect(debugOut.result.metadata.removedMessageCount).toBeLessThan(
      normalOut.result.metadata.removedMessageCount,
    );
  });

  it('effectiveCompactionThresholds leaves required unchanged', () => {
    const base = { background: 0.65, suggest: 0.8, required: 0.85 };
    expect(effectiveCompactionThresholds(base, 'aggressive')).toEqual({
      background: 0.6,
      suggest: 0.75,
      required: 0.85,
    });
  });
});

describe('CompactionOrchestrator', () => {
  it('manual compact uses session-memory at low urgency (not micro)', async () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 1000,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    const ws = mkdtempSync(join(tmpdir(), 'manual-sm-'));
    mkdirSync(join(ws, '.ciro', 'memory'), { recursive: true });
    writeFileSync(
      join(ws, '.ciro', 'memory', 'session-memory.md'),
      '# Session Memory\n\n- prior note\n',
    );
    const conv = 'User: early\n'.repeat(50) + 'User: RECENT\n';
    ctx.refresh('s', { conversation: conv });
    const orch = new CompactionOrchestrator(cfg, ctx, createStubFullCompactSummarizer());
    const out = await orch.compact({
      sessionId: 's',
      workspace: ws,
      mode: 'agent',
      method: 'manual',
      conversationText: conv,
      toolResults: [],
      sessionDir: mkdtempSync(join(tmpdir(), 'manual-sm-sess-')),
    });
    expect(out.result.metadata.method).toBe('session-memory');
    expect(out.summarizedText).toContain('Session memory');
  });

  it('manual compact uses full at suggest urgency', async () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    ctx.refresh('s', { system: 'x'.repeat(320) }); // 80% → suggest
    const orch = new CompactionOrchestrator(
      cfg,
      ctx,
      createStubFullCompactSummarizer(
        '# Compaction summary\n\n## Current Work\n- stub\n',
      ),
    );
    const ws = mkdtempSync(join(tmpdir(), 'manual-full-'));
    mkdirSync(join(ws, '.ciro', 'memory'), { recursive: true });
    const out = await orch.compact({
      sessionId: 's',
      workspace: ws,
      mode: 'agent',
      method: 'manual',
      conversationText: 'User: hello\nAssistant: hi\n',
      toolResults: [],
      sessionDir: mkdtempSync(join(tmpdir(), 'manual-full-sess-')),
    });
    expect(out.result.metadata.method).toBe('full');
  });

  it('auto decides micro at background urgency', () => {
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: {
        ...DEFAULT_COMPACTION_CONFIG,
        mode: 'auto',
        thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
      },
    });
    ctx.refresh('s', { system: 'x'.repeat(240) }); // 60%
    const orch = new CompactionOrchestrator(
      {
        ...DEFAULT_COMPACTION_CONFIG,
        mode: 'auto',
        thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
      },
      ctx,
    );
    expect(orch.decideAutoAction('s').action).toBe('micro');
  });

  it('toolPayloadTokens can push urgency to micro', () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    ctx.refresh('s', { conversation: 'x'.repeat(80) }); // ~20 → none
    expect(ctx.getCompactUrgency('s')).toBe('none');
    ctx.refresh('s', { conversation: 'x'.repeat(80), toolPayloadTokens: 40 }); // ~60
    const orch = new CompactionOrchestrator(cfg, ctx);
    expect(orch.decideAutoAction('s').action).toBe('micro');
  });

  it('ask mode suggests at suggest urgency', () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'ask' as const,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    ctx.refresh('s', { system: 'x'.repeat(320) }); // 80%
    const orch = new CompactionOrchestrator(cfg, ctx);
    expect(orch.decideAutoAction('s').action).toBe('suggest');
  });

  it('auto decides full at required urgency', () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    ctx.refresh('s', { system: 'x'.repeat(400) }); // 100%
    const orch = new CompactionOrchestrator(cfg, ctx);
    expect(orch.decideAutoAction('s').action).toBe('full');
  });
});

describe('full-compact', () => {
  it('uses summarizer markdown and anchors over previous summary', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const ws = mkdtempSync(join(tmpdir(), 'full-c-'));
    mkdirSync(join(ws, '.ciro', 'memory'), { recursive: true });
    writeFileSync(
      join(ws, '.ciro', 'memory', 'session-memory.md'),
      '# Session Memory\n\n- used Redis\n',
    );
    const long = 'EARLY\n'.repeat(200) + 'User: RECENT_TAIL\n';
    const stubMd = `# Compaction summary

## Current Work
- LLM stub summary
`;
    const out = await runFullCompact({
      workspace: ws,
      mode: 'ask',
      conversationText: long,
      summarizedText: '# Compaction summary\n\nold block that must be replaced',
      keepRecentTokens: 50,
      summarizer: createStubFullCompactSummarizer(stubMd),
    });
    expect(out.result.metadata.method).toBe('full');
    expect(out.summarizedText).toContain('LLM stub summary');
    expect(out.summarizedText).not.toContain('old block');
    expect(out.summarizedText).not.toContain('---');
    expect(out.conversationText).toContain('RECENT_TAIL');
  });

  it('normalizes missing Compaction summary heading', () => {
    expect(normalizeCompactionSummaryMarkdown('## Intent\n- x')).toMatch(
      /^# Compaction summary\n/,
    );
  });

  it('fails without summarizer; fuse after consecutive failures', async () => {
    const cfg = {
      ...DEFAULT_COMPACTION_CONFIG,
      mode: 'auto' as const,
      maxConsecutiveFailures: 2,
      thresholds: { background: 0.5, suggest: 0.7, required: 0.9 },
    };
    const ctx = new ContextAccountant({
      modelContextLimit: 100,
      reservedOutputTokens: 0,
      compaction: cfg,
    });
    ctx.refresh('s', { system: 'x'.repeat(400) });
    const orch = new CompactionOrchestrator(cfg, ctx); // no summarizer
    await expect(
      orch.compact({
        sessionId: 's',
        workspace: mkdtempSync(join(tmpdir(), 'fuse-')),
        mode: 'ask',
        method: 'full',
        conversationText: 'User: hi\n',
        toolResults: [],
        sessionDir: mkdtempSync(join(tmpdir(), 'fuse-sess-')),
      }),
    ).rejects.toThrow(/FULL_COMPACT_NO_SUMMARIZER/);
    expect(orch.consecutiveFailureCount('s')).toBe(1);
    await expect(
      orch.compact({
        sessionId: 's',
        workspace: mkdtempSync(join(tmpdir(), 'fuse2-')),
        mode: 'ask',
        method: 'full',
        conversationText: 'User: hi\n',
        toolResults: [],
        sessionDir: mkdtempSync(join(tmpdir(), 'fuse-sess2-')),
      }),
    ).rejects.toThrow(/FULL_COMPACT_NO_SUMMARIZER/);
    expect(orch.consecutiveFailureCount('s')).toBe(2);
    expect(orch.decideAutoAction('s').action).toBe('none');
  });

  it('orchestrator full with stub summarizer', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'orch-full-'));
    const ctx = new ContextAccountant();
    const orch = new CompactionOrchestrator(
      DEFAULT_COMPACTION_CONFIG,
      ctx,
      createStubFullCompactSummarizer('# Compaction summary\n\n## Intent\n- ok\n'),
    );
    const out = await orch.compact({
      sessionId: 's1',
      workspace: ws,
      mode: 'agent',
      method: 'full',
      conversationText: 'User: early\n'.repeat(100) + 'User: RECENT\n',
      toolResults: [],
      sessionDir: mkdtempSync(join(tmpdir(), 'orch-full-sess-')),
    });
    expect(out.summarizedText).toContain('# Compaction summary');
    expect(out.conversationText).toContain('RECENT');
  });
});
