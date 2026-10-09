import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContextAccountant } from '../context/context-accountant.js';
import { DEFAULT_COMPACTION_CONFIG } from '@ciro/harness-shared';
import { ToolResultStore, buildPreview } from './tool-result-store.js';
import { runMicroCompact } from './micro-compact.js';
import {
  appendSessionNote,
  readSessionMemory,
  runSessionMemoryCompact,
} from './session-memory.js';
import { CompactionOrchestrator } from './orchestrator.js';

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

describe('CompactionOrchestrator', () => {
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
  it('extracts structured sections and formats markdown', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { runFullCompact, formatCompactionMarkdown } = await import('./full-compact.js');
    const ws = mkdtempSync(join(tmpdir(), 'full-c-'));
    mkdirSync(join(ws, '.ciro', 'memory'), { recursive: true });
    writeFileSync(
      join(ws, '.ciro', 'memory', 'session-memory.md'),
      '# Session Memory\n\n- decided to use Redis\n- wrote src/app.ts\n- TODO: add tests\n- found a race condition\n',
    );
    const long = 'EARLY\n'.repeat(200) + 'User: RECENT_TAIL\n';
    const out = runFullCompact({
      workspace: ws,
      mode: 'ask',
      conversationText: long,
      keepRecentTokens: 50,
    });
    expect(out.result.metadata.method).toBe('full');
    expect(out.result.structured?.decisions.length).toBeGreaterThan(0);
    expect(out.result.structured?.fileChanges.length).toBeGreaterThan(0);
    expect(out.summarizedText).toContain('## Decisions');
    expect(out.conversationText).toContain('RECENT_TAIL');
    expect(formatCompactionMarkdown(out.result)).toContain('# Compaction summary');
  });
});
