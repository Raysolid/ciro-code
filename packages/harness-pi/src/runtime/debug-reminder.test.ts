import { describe, expect, it } from 'vitest';
import { injectDebugReminder } from './debug-reminder.js';

describe('injectDebugReminder', () => {
  it('replaces {{DEBUG_*}} placeholders without duplicating the workflow', () => {
    const raw = [
      'Debug mode.',
      'Ingest: {{DEBUG_INGEST_URL}}',
      'Log: {{DEBUG_LOG_PATH}}',
      'Session: {{DEBUG_SESSION_ID}}',
    ].join('\n');
    const out = injectDebugReminder(raw, {
      debugSessionId: 'abc123',
      ingestUrl: 'http://127.0.0.1:9999/ingest/tok',
      logPathRel: '.ciro/debug/debug-abc123.log',
    });
    expect(out).toContain('http://127.0.0.1:9999/ingest/tok');
    expect(out).toContain('.ciro/debug/debug-abc123.log');
    expect(out).toContain('abc123');
    expect(out).not.toContain('{{DEBUG_INGEST_URL}}');
    expect(out).not.toContain('## Runtime logging (this session)');
    expect(out).toContain('## This turn (Debug)');
    expect(out).toContain('Add probes now');
    expect(out).toContain('End this turn with a closed <reproduction_steps> block');
  });

  it('uses analyze / cleanup this-turn hints after HITL unlock', () => {
    const info = {
      debugSessionId: 'abc123',
      ingestUrl: 'http://127.0.0.1:9999/ingest/tok',
      logPathRel: '.ciro/debug/debug-abc123.log',
    };
    const analyzed = injectDebugReminder('Ingest: {{DEBUG_INGEST_URL}}', {
      ...info,
      analyzeUnlocked: true,
    });
    expect(analyzed).toContain('The user reproduced');
    expect(analyzed).toContain('End this turn with a closed <reproduction_steps> block');
    expect(analyzed).toContain('post-fix log evidence');
    expect(analyzed).not.toContain('If the fix is complete, last item must tell the user to Mark as fixed');
    expect(analyzed).not.toContain('Add probes now');
    const cleaned = injectDebugReminder('Ingest: {{DEBUG_INGEST_URL}}', {
      ...info,
      cleanupUnlocked: true,
    });
    expect(cleaned).toContain('marked the issue fixed');
    expect(cleaned).toContain('Do not emit <reproduction_steps>');
  });

  it('does not rewrite leftover Cursor-style filenames or sample ingest URLs', () => {
    const raw = [
      'Do not read debug-a06789.log at repo root.',
      'Sample was http://127.0.0.1:7810/ingest/9cf31f2f-490c-4fc3-a7d5-cb589f6329c6',
      'Real: {{DEBUG_LOG_PATH}}',
    ].join('\n');
    const out = injectDebugReminder(raw, {
      debugSessionId: 'abc123',
      ingestUrl: 'http://127.0.0.1:9999/ingest/tok',
      logPathRel: '.ciro/debug/debug-abc123.log',
    });
    expect(out).toContain('debug-a06789.log');
    expect(out).toContain('http://127.0.0.1:7810/ingest/9cf31f2f-490c-4fc3-a7d5-cb589f6329c6');
    expect(out).toContain('.ciro/debug/debug-abc123.log');
  });

  it('stops when ingest failed', () => {
    const out = injectDebugReminder('x', {
      debugSessionId: 'x',
      ingestUrl: '',
      logPathRel: '',
      failed: true,
    });
    expect(out).toMatch(/Ingest server failed/i);
  });
});
