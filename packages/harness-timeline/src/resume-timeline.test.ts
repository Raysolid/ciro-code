import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import { mergeSubagentMetasOnResume } from './message-timeline.js';
import {
  mapResumeTimeline,
  modeSuggestStatusFromPreview,
  type ResumeTimelineItem,
} from './types.js';

describe('modeSuggestStatusFromPreview', () => {
  it('detects skipped / switched / already-in', () => {
    expect(
      modeSuggestStatusFromPreview(
        'User skipped switching to plan. Stay in ask and continue without insisting on a mode change.',
      ),
    ).toBe('skipped');
    expect(
      modeSuggestStatusFromPreview('User switched to plan. Continue in that mode; do not ask them to switch again.'),
    ).toBe('switched');
    expect(modeSuggestStatusFromPreview('Already in agent mode. Continue without switching.')).toBe(
      'skipped',
    );
  });
});

describe('mapResumeTimeline SuggestMode / Task', () => {
  it('maps SuggestMode tool to mode_suggest card', () => {
    const items: ResumeTimelineItem[] = [
      {
        kind: 'tool',
        id: 'sm1',
        toolName: 'SuggestMode',
        status: 'done',
        toolInput: { suggestedMode: 'plan', reason: 'Need a design first' },
        preview: 'User switched to plan. Continue in that mode; do not ask them to switch again.',
      },
    ];
    expect(mapResumeTimeline(items)).toEqual([
      expect.objectContaining({
        kind: 'mode_suggest',
        id: 'sm1',
        suggestedMode: 'plan',
        reason: 'Need a design first',
        status: 'switched',
      }),
    ]);
  });

  it('maps Task tool to subagent card (not tool row)', () => {
    const items: ResumeTimelineItem[] = [
      {
        kind: 'tool',
        id: 'tc-task-1',
        toolName: 'Task',
        status: 'done',
        toolInput: { subagent_type: 'explore', title: '人才库模块调研', prompt: 'go' },
        preview: '{"conclusion":"ok"}',
      },
      {
        kind: 'tool',
        id: 'tc-read',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'a.ts' },
      },
    ];
    const mapped = mapResumeTimeline(items)!;
    expect(mapped[0]).toMatchObject({
      kind: 'subagent',
      taskId: 'tc-task-1',
      title: '人才库模块调研',
      status: 'completed',
    });
    expect(mapped[1]).toMatchObject({ kind: 'tool', toolName: 'read' });
  });
});

describe('mergeSubagentMetasOnResume', () => {
  it('fills real taskId on existing placeholders without moving to last message', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'summary',
        status: 'completed',
        timeline: [
          {
            kind: 'subagent',
            id: 'subagent-tc1',
            taskId: 'tc1',
            title: '调研 A',
            subagentType: 'explore',
            status: 'completed',
          },
          { kind: 'text', id: 't1', text: 'summary', ended: true },
        ],
      },
      {
        id: 'a2',
        role: 'assistant',
        content: 'later',
        status: 'completed',
        timeline: [{ kind: 'text', id: 't2', text: 'later', ended: true }],
      },
    ];
    const next = mergeSubagentMetasOnResume(messages, [
      {
        taskId: 'real-task-1',
        title: '调研 A',
        status: 'completed',
        createdAt: 10,
      },
    ]);
    expect(next[0]!.timeline?.[0]).toMatchObject({
      kind: 'subagent',
      taskId: 'real-task-1',
      title: '调研 A',
    });
    expect(next[1]!.timeline?.some((i) => i.kind === 'subagent')).toBe(false);
  });

  it('leaves messages unchanged when no subagent placeholder exists', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'hi',
        status: 'completed',
        timeline: [{ kind: 'text', id: 't1', text: 'hi', ended: true }],
      },
    ];
    const next = mergeSubagentMetasOnResume(messages, [
      {
        taskId: 'orphan-1',
        title: '遗留任务',
        status: 'completed',
        createdAt: 1,
      },
    ]);
    expect(next).toEqual(messages);
    expect(next[0]!.timeline?.some((i) => i.kind === 'subagent')).toBe(false);
  });
});

describe('mapResumeTimeline AskQuestion', () => {
  it('maps AskQuestion tool to ask_question card', () => {
    const items: ResumeTimelineItem[] = [
      {
        kind: 'tool',
        id: 'aq1',
        toolName: 'AskQuestion',
        status: 'done',
        toolInput: {
          questions: [{ id: 'q1', prompt: 'Which UI?', options: [{ id: 'a', label: 'OK' }] }],
        },
        preview: '[[plan_q]]{"answers":[{"questionId":"q1","optionIds":["a"]}]}\nUser answers:',
      },
    ];
    expect(mapResumeTimeline(items)).toEqual([
      expect.objectContaining({
        kind: 'ask_question',
        id: 'aq1',
        status: 'answered',
        answers: [{ questionId: 'q1', optionIds: ['a'] }],
      }),
    ]);
  });

  it('parses AskQuestion answers from wrapped tool JSON', () => {
    const items: ResumeTimelineItem[] = [
      {
        kind: 'tool',
        id: 'aq2',
        toolName: 'AskQuestion',
        status: 'done',
        toolInput: {
          questions: [{ id: 'q1', prompt: 'Color?' }],
        },
        preview: JSON.stringify({
          content: [
            {
              type: 'text',
              text: '[[plan_q]]{"answers":[{"questionId":"q1","customText":"blue","label":"blue"}]}\nUser answers:',
            },
          ],
          details: { error: false, answers: [{ questionId: 'q1', customText: 'blue', label: 'blue' }] },
        }),
      },
    ];
    const mapped = mapResumeTimeline(items)!;
    expect(mapped[0]).toMatchObject({
      kind: 'ask_question',
      status: 'answered',
      answers: [expect.objectContaining({ questionId: 'q1', customText: 'blue' })],
    });
  });
});

describe('mapResumeTimeline CreatePlan confirmedPlanId', () => {
  const planItems: ResumeTimelineItem[] = [
    {
      kind: 'tool',
      id: 'tc-plan',
      toolName: 'CreatePlan',
      status: 'done',
      toolInput: { title: 'Ship', plan: '## Steps\nDo it' },
      preview: 'Plan created (id=abcdef12, title=Ship). Waiting for user Confirm/Build.',
    },
  ];

  it('marks matching plan confirmed', () => {
    const mapped = mapResumeTimeline(planItems, { confirmedPlanId: 'abcdef12' })!;
    expect(mapped[0]).toMatchObject({
      kind: 'plan',
      planId: 'abcdef12',
      status: 'confirmed',
    });
  });

  it('keeps pending when confirmedPlanId missing or mismatched', () => {
    expect(mapResumeTimeline(planItems)![0]).toMatchObject({ status: 'pending' });
    expect(mapResumeTimeline(planItems, { confirmedPlanId: 'other999' })![0]).toMatchObject({
      status: 'pending',
    });
  });
});

describe('mapResumeTimeline TodoWrite', () => {
  it('omits TodoWrite from the timeline', () => {
    const items: ResumeTimelineItem[] = [
      {
        kind: 'tool',
        id: 'tw1',
        toolName: 'TodoWrite',
        status: 'done',
        toolInput: { todos: [{ id: 't1', content: 'step', status: 'completed' }] },
      },
      { kind: 'text', id: 'txt1', text: 'done' },
    ];
    expect(mapResumeTimeline(items)).toEqual([
      expect.objectContaining({ kind: 'text', id: 'txt1', text: 'done' }),
    ]);
  });
});

describe('mapResumeTimeline nested steer user', () => {
  it('maps timeline user items for resume nesting', () => {
    const items: ResumeTimelineItem[] = [
      { kind: 'text', id: 't1', text: 'before' },
      {
        kind: 'user',
        id: 'steer-1',
        text: 'go left',
        images: [{ path: 'attachments/steer-1/0.png', mimeType: 'image/png' }],
      },
      { kind: 'text', id: 't2', text: 'after' },
    ];
    expect(mapResumeTimeline(items)).toEqual([
      expect.objectContaining({ kind: 'text', id: 't1' }),
      expect.objectContaining({
        kind: 'user',
        id: 'steer-1',
        text: 'go left',
        images: [{ path: 'attachments/steer-1/0.png', mimeType: 'image/png' }],
      }),
      expect.objectContaining({ kind: 'text', id: 't2' }),
    ]);
  });
});
