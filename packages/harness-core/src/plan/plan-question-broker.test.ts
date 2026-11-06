import { describe, expect, it } from 'vitest';
import { PlanQuestionBroker } from './plan-question-broker.js';

describe('PlanQuestionBroker', () => {
  it('rejects second pending request for same session', async () => {
    const broker = new PlanQuestionBroker();
    broker.setRequestHandler(() => {});
    const first = broker.requestAnswers({
      sessionId: 's1',
      questions: [{ id: 'q1', prompt: 'A?' }],
    });
    await expect(
      broker.requestAnswers({
        sessionId: 's1',
        questions: [{ id: 'q2', prompt: 'B?' }],
      }),
    ).rejects.toThrow(/PLAN_QUESTION_BUSY/);
    broker.rejectAll('s1');
    await expect(first).resolves.toMatchObject({ decision: { skipped: true } });
  });

  it('resolves with answers', async () => {
    const broker = new PlanQuestionBroker();
    let id = '';
    broker.setRequestHandler((req) => {
      id = req.id;
    });
    const pending = broker.requestAnswers({
      sessionId: 's1',
      questions: [{ id: 'q1', prompt: 'A?' }],
    });
    expect(broker.resolve(id, { answers: [{ questionId: 'q1', optionIds: ['a'] }] })).toBe(true);
    await expect(pending).resolves.toMatchObject({
      id,
      decision: { answers: [{ questionId: 'q1', optionIds: ['a'] }] },
    });
  });
});
