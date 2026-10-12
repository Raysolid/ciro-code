import { describe, expect, it, vi } from 'vitest';
import { ModeSuggestBroker } from '@ciro-code/harness-core';
import { createSuggestModeTool } from './mode-suggest-tool.js';

describe('createSuggestModeTool', () => {
  it('awaits broker and reports switch', async () => {
    const broker = new ModeSuggestBroker();
    const onSwitched = vi.fn(async () => {});
    let suggestId = '';
    broker.setRequestHandler((req) => {
      suggestId = req.id;
    });
    const tool = createSuggestModeTool({
      sessionId: 's1',
      broker,
      getCurrentMode: () => 'agent',
      onSwitched,
    });

    const pending = tool.execute('tc1', {
      suggestedMode: 'plan',
      reason: 'need architecture trade-offs',
    });

    await vi.waitFor(() => expect(suggestId).toBeTruthy());
    expect(broker.resolve(suggestId, 'switch')).toBe(true);

    const result = await pending;
    expect(onSwitched).toHaveBeenCalledWith('plan', 'agent');
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('switched to plan'),
    });
  });

  it('noops when already in target mode', async () => {
    const tool = createSuggestModeTool({
      sessionId: 's1',
      broker: new ModeSuggestBroker(),
      getCurrentMode: () => 'plan',
    });
    const result = await tool.execute('tc1', {
      suggestedMode: 'plan',
      reason: 'x',
    });
    expect(result.details).toMatchObject({ decision: 'noop' });
  });

  it('fails when session already has a pending suggestion', async () => {
    const broker = new ModeSuggestBroker();
    let firstId = '';
    broker.setRequestHandler((req) => {
      firstId = req.id;
    });
    const tool = createSuggestModeTool({
      sessionId: 's1',
      broker,
      getCurrentMode: () => 'agent',
    });

    const first = tool.execute('tc1', {
      suggestedMode: 'plan',
      reason: 'first',
    });
    await vi.waitFor(() => expect(firstId).toBeTruthy());

    const second = await tool.execute('tc2', {
      suggestedMode: 'debug',
      reason: 'second',
    });
    expect(second.details).toMatchObject({ error: true });
    expect(String((second.content[0] as { text?: string })?.text ?? '')).toMatch(
      /MODE_SUGGEST_BUSY/,
    );

    expect(broker.resolve(firstId, 'skip')).toBe(true);
    await first;
  });
});
