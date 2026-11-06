import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import { confirmPlanInMessages, upsertPlanItem } from './message-timeline.js';
import {
  mapResumeTimeline,
  planCardOverview,
  planIdFromPreview,
  planTitleFromMarkdown,
  planTitleFromPreview,
  resolvePlanTitle,
} from './types.js';

describe('planCardOverview', () => {
  it('strips headings and truncates', () => {
    const md = '# Title\n\n## Overview\n\nFirst sentence about the change.\n\n- todo';
    expect(planCardOverview(md, 40)).toMatch(/Title Overview First/);
    expect(planCardOverview(md, 40).endsWith('…')).toBe(true);
  });
});

describe('planIdFromPreview', () => {
  it('parses CreatePlan result preview', () => {
    expect(
      planIdFromPreview('Plan created (id=abc-123, title=Foo). Waiting for user Confirm/Build.'),
    ).toBe('abc-123');
  });
});

describe('resolvePlanTitle', () => {
  it('prefers explicit title, then markdown H1; rejects CreatePlan tool name', () => {
    expect(resolvePlanTitle('CreatePlan', planTitleFromMarkdown('# 五子棋\n\nbody'))).toBe(
      '五子棋',
    );
    expect(planTitleFromPreview('Plan created (id=x, title=Ship).')).toBe('Ship');
    expect(resolvePlanTitle(undefined, undefined)).toBe('Plan');
  });
});

describe('mapResumeTimeline plan title fallback', () => {
  it('does not use CreatePlan tool name when title omitted', () => {
    const mapped = mapResumeTimeline([
      {
        kind: 'tool',
        id: 'tc1',
        toolName: 'CreatePlan',
        status: 'done',
        toolInput: { plan: '# 五子棋小游戏\n\n目标：单文件 HTML' },
        preview: 'Plan created (id=p1, title=Plan). Waiting for user Confirm/Build.',
      },
    ]);
    expect(mapped?.[0]).toMatchObject({
      kind: 'plan',
      title: '五子棋小游戏',
    });
  });
});

describe('upsertPlanItem / confirmPlanInMessages', () => {
  const base: ChatMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      timeline: [],
    },
  ];

  it('inserts and updates by planId', () => {
    let msgs = upsertPlanItem(base, 'a1', {
      planId: 'p1',
      title: 'T1',
      markdown: 'Body one',
      todos: [{ id: 't1', content: 'step', status: 'pending' }],
    });
    expect(msgs[0]!.timeline).toEqual([
      expect.objectContaining({
        kind: 'plan',
        planId: 'p1',
        title: 'T1',
        status: 'pending',
        todos: [{ id: 't1', content: 'step', status: 'pending' }],
      }),
    ]);
    msgs = upsertPlanItem(msgs, 'a1', {
      planId: 'p1',
      title: 'T2',
      markdown: 'Body two longer',
      todos: [{ id: 't1', content: 'step2', status: 'completed' }],
    });
    expect(msgs[0]!.timeline).toHaveLength(1);
    expect(msgs[0]!.timeline![0]).toMatchObject({
      title: 'T2',
      status: 'pending',
      todos: [{ id: 't1', content: 'step2', status: 'completed' }],
    });
  });

  it('marks confirmed across messages', () => {
    const msgs = upsertPlanItem(base, 'a1', {
      planId: 'p1',
      title: 'T',
      markdown: 'x',
    });
    const next = confirmPlanInMessages(msgs, 'p1');
    expect(next[0]!.timeline![0]).toMatchObject({ status: 'confirmed' });
  });

  it('updates existing planId on the original message instead of duplicating', () => {
    const withBuild: ChatMessage[] = [
      ...upsertPlanItem(base, 'a1', { planId: 'p1', title: 'T', markdown: 'Body' }),
      { id: 'a2', role: 'assistant', content: '', status: 'streaming', timeline: [] },
    ];
    const next = upsertPlanItem(withBuild, 'a2', {
      planId: 'p1',
      title: 'T',
      markdown: 'Body',
      confirmedAt: 1,
    });
    expect(next[0]!.timeline).toHaveLength(1);
    expect(next[0]!.timeline![0]).toMatchObject({ planId: 'p1', status: 'confirmed' });
    expect(next[1]!.timeline).toEqual([]);
  });
});
