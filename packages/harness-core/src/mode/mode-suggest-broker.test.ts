import { describe, expect, it } from 'vitest';
import { ModeSuggestBroker } from './mode-suggest-broker.js';

describe('ModeSuggestBroker', () => {
  it('rejects second pending request for same session', async () => {
    const broker = new ModeSuggestBroker();
    broker.setRequestHandler(() => {});
    const first = broker.requestApproval({
      sessionId: 's1',
      suggestedMode: 'plan',
      currentMode: 'agent',
      reason: 'a',
    });
    await expect(
      broker.requestApproval({
        sessionId: 's1',
        suggestedMode: 'debug',
        currentMode: 'agent',
        reason: 'b',
      }),
    ).rejects.toThrow(/MODE_SUGGEST_BUSY/);
    broker.rejectAll('s1');
    await expect(first).resolves.toMatchObject({ decision: 'skip' });
  });
});
