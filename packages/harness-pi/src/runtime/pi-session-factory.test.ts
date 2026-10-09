import { describe, expect, it } from 'vitest';
import { previewFromToolResult, clipToolPreview, toolResultIsError } from './tool-error.js';
import { createSessionPromptRefs, seedSessionManager } from './pi-session-factory.js';

describe('toolResultIsError', () => {
  it('treats framework isError as error', () => {
    expect(toolResultIsError({ isError: true, result: { details: { error: false } } })).toBe(true);
  });

  it('treats details.error from custom tools as error', () => {
    expect(
      toolResultIsError({
        isError: false,
        result: { content: [{ type: 'text', text: 'fail' }], details: { error: true } },
      }),
    ).toBe(true);
  });

  it('ignores successful returns', () => {
    expect(
      toolResultIsError({
        isError: false,
        result: { content: [{ type: 'text', text: 'ok' }], details: { error: false } },
      }),
    ).toBe(false);
  });
});

describe('previewFromToolResult', () => {
  it('extracts text content from tool result objects', () => {
    expect(
      previewFromToolResult({
        content: [{ type: 'text', text: '[[plan_q]]{"answers":[]}' }],
        details: { error: false },
      }),
    ).toBe('[[plan_q]]{"answers":[]}');
    expect(clipToolPreview('x'.repeat(10), 'AskQuestion').length).toBe(10);
  });

  it('unwraps a JSON envelope string before clipping', () => {
    expect(
      previewFromToolResult(
        JSON.stringify({
          content: [{ type: 'text', text: 'exit 1\nstdout:\nfail' }],
          details: { error: true },
        }),
      ),
    ).toBe('exit 1\nstdout:\nfail');
  });
});

describe('seedSessionManager', () => {
  it('seeds user/assistant messages into in-memory SessionManager', () => {
    const sm = seedSessionManager('/tmp/ws', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    const ctx = sm.buildSessionContext();
    expect(ctx.messages.length).toBe(2);
    expect(ctx.messages[0]).toMatchObject({ role: 'user' });
    expect(ctx.messages[1]).toMatchObject({ role: 'assistant' });
  });

  it('skips empty content', () => {
    const sm = seedSessionManager('/tmp/ws', [
      { role: 'user', content: '' },
      { role: 'user', content: 'keep' },
    ]);
    expect(sm.buildSessionContext().messages.length).toBe(1);
  });
});

describe('createSessionPromptRefs', () => {
  it('holds mutable mode prompt and turn extras', () => {
    const refs = createSessionPromptRefs('base');
    expect(refs.modePrompt.current).toBe('base');
    expect(refs.debugInfo.current).toBeNull();
    refs.modePrompt.current = 'agent';
    refs.turnExtras.current = 'memory';
    expect(refs.modePrompt.current).toBe('agent');
    expect(refs.turnExtras.current).toBe('memory');
  });
});
