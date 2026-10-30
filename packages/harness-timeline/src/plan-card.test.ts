import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import { confirmPlanInMessages, upsertPlanItem } from './message-timeline.js';
import { planCardOverview, planIdFromPreview } from './types.js';

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
    });
    expect(msgs[0]!.timeline).toEqual([
      expect.objectContaining({
        kind: 'plan',
        planId: 'p1',
        title: 'T1',
        status: 'pending',
      }),
    ]);
    msgs = upsertPlanItem(msgs, 'a1', {
      planId: 'p1',
      title: 'T2',
      markdown: 'Body two longer',
    });
    expect(msgs[0]!.timeline).toHaveLength(1);
    expect(msgs[0]!.timeline![0]).toMatchObject({ title: 'T2', status: 'pending' });
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
