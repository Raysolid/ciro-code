import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_TASK_RESULT_MARKER,
  formatBackgroundTaskResultUserMessage,
  isBackgroundTaskResultUserMessage,
} from './background-task-hitl.js';

describe('background-task-hitl', () => {
  it('formats and detects idle delivery messages', () => {
    const text = formatBackgroundTaskResultUserMessage({
      taskId: 't1',
      subagent_type: 'explore',
      status: 'completed',
      summary: {
        conclusion: 'ok',
        paths: ['a.ts'],
        symbols: [],
        openQuestions: [],
        confidence: 'high',
      },
    });
    expect(text.startsWith(BACKGROUND_TASK_RESULT_MARKER)).toBe(true);
    expect(isBackgroundTaskResultUserMessage(text)).toBe(true);
    expect(text).toContain('"taskId":"t1"');
    expect(text).toMatch(/Continue the user request/i);
    expect(isBackgroundTaskResultUserMessage('hello')).toBe(false);
  });
});
