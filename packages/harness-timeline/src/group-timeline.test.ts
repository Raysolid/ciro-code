import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat-message.js';
import {
  groupTimelineForView,
  splitProcessAndFinal,
  splitViewAroundUser,
  timelineActivityItems,
} from './group-timeline.js';
import { testT as t } from './test-translate.js';
import type { TimelineItem } from './types.js';

describe('groupTimelineForView', () => {
  it('groups consecutive tools and keeps text between groups', () => {
    const items: TimelineItem[] = [
      { kind: 'thought', id: 'th1', text: '…', startedAt: 1, ended: true, durationSec: 1 },
      { kind: 'text', id: 'tx1', text: 'hello', ended: true },
      {
        kind: 'tool',
        id: 't1',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'a.ts' },
      },
      {
        kind: 'tool',
        id: 't2',
        toolName: 'grep',
        status: 'done',
        toolInput: { pattern: 'x' },
      },
      { kind: 'text', id: 'tx2', text: 'world', ended: true },
      {
        kind: 'tool',
        id: 't3',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'b.ts' },
      },
    ];
    const nodes = groupTimelineForView(items, t);
    expect(nodes.map((n) => n.type)).toEqual([
      'thought',
      'text',
      'toolGroup',
      'text',
      'toolGroup',
    ]);
    expect(nodes[2]).toMatchObject({
      type: 'toolGroup',
      summary: 'Explored 1 file, 1 search',
    });
    expect(nodes[4]).toMatchObject({ type: 'toolGroup', summary: 'Read b.ts' });
  });

  it('keeps shell tools as independent nodes outside Used tools', () => {
    const items: TimelineItem[] = [
      {
        kind: 'tool',
        id: 'r1',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'a.ts' },
      },
      {
        kind: 'tool',
        id: 'g1',
        toolName: 'grep',
        status: 'done',
        toolInput: { pattern: 'x' },
      },
      {
        kind: 'tool',
        id: 's1',
        toolName: 'bash',
        status: 'done',
        toolInput: { command: 'ls', description: 'List files' },
      },
      {
        kind: 'tool',
        id: 's2',
        toolName: 'pwsh',
        status: 'done',
        toolInput: { command: 'Get-ChildItem' },
      },
      {
        kind: 'tool',
        id: 'r2',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'b.ts' },
      },
    ];
    const nodes = groupTimelineForView(items, t);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toMatchObject({
      type: 'toolGroup',
      summary: 'Explored 1 file, 1 search',
    });
    expect(nodes[1]).toMatchObject({
      type: 'toolGroup',
      tools: [{ id: 's1', toolName: 'bash' }],
    });
    expect(nodes[2]).toMatchObject({
      type: 'toolGroup',
      tools: [{ id: 's2', toolName: 'pwsh' }],
    });
    expect(nodes[3]).toMatchObject({
      type: 'toolGroup',
      summary: 'Read b.ts',
    });
  });

  it('emits write/edit diffs as independent nodes outside tool groups', () => {
    const items: TimelineItem[] = [
      {
        kind: 'tool',
        id: 'w1',
        toolName: 'write',
        status: 'done',
        toolInput: { path: 'a.ts' },
      },
      {
        kind: 'diff',
        id: 'd1',
        path: 'a.ts',
        operation: 'write',
        summary: 'wrote',
        unifiedDiff: '+++ b/a.ts\n+hello\n',
        toolCallId: 'w1',
      },
      { kind: 'text', id: 'tx', text: 'done', ended: true },
    ];
    const nodes = groupTimelineForView(items, t);
    expect(nodes.map((n) => n.type)).toEqual(['diff', 'text']);
    expect(nodes[0]).toMatchObject({ type: 'diff', item: { id: 'd1', path: 'a.ts' } });
  });

  it('keeps failed write/edit in the tool group', () => {
    const nodes = groupTimelineForView(
      [
        {
          kind: 'tool',
          id: 'r1',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        {
          kind: 'tool',
          id: 'e1',
          toolName: 'edit',
          status: 'error',
          toolInput: { path: 'a.ts' },
          preview: 'old_string not found',
        },
        {
          kind: 'tool',
          id: 'w1',
          toolName: 'write',
          status: 'error',
          toolInput: { path: 'b.ts' },
        },
      ],
      t,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'toolGroup',
      tools: [{ id: 'r1' }, { id: 'e1' }, { id: 'w1' }],
    });
  });

  it('does not count completed write/edit in Explored / Used totals', () => {
    const nodes = groupTimelineForView(
      [
        {
          kind: 'tool',
          id: 'r1',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        {
          kind: 'tool',
          id: 'e1',
          toolName: 'edit',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        {
          kind: 'tool',
          id: 'g1',
          toolName: 'grep',
          status: 'done',
          toolInput: { pattern: 'runId', path: 'a.ts' },
        },
        {
          kind: 'tool',
          id: 'w1',
          toolName: 'write',
          status: 'done',
          toolInput: { path: 'b.ts' },
        },
      ],
      t,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: 'toolGroup',
      summary: 'Explored 1 file, 1 search',
      tools: [{ id: 'r1' }, { id: 'g1' }],
    });
  });

  it('keeps plan cards as independent nodes outside tool groups', () => {
    const items: TimelineItem[] = [
      {
        kind: 'tool',
        id: 'r1',
        toolName: 'read',
        status: 'done',
        toolInput: { path: 'a.ts' },
      },
      {
        kind: 'plan',
        id: 'plan-1',
        planId: 'p1',
        title: 'Right rail P0',
        overview: 'Merge plan and debug',
        status: 'pending',
      },
      { kind: 'text', id: 'tx', text: 'ready', ended: true },
    ];
    const nodes = groupTimelineForView(items, t);
    expect(nodes.map((n) => n.type)).toEqual(['toolGroup', 'plan', 'text']);
    expect(nodes[1]).toMatchObject({
      type: 'plan',
      item: { planId: 'p1', status: 'pending' },
    });
  });

  it('legacy content becomes trailing text when no text parts', () => {
    const message: ChatMessage = {
      id: 'm1',
      role: 'assistant',
      content: 'final answer',
      status: 'completed',
      timeline: [
        { kind: 'tool', id: 't1', toolName: 'read', status: 'done', toolInput: { path: 'a' } },
      ],
    };
    const activity = timelineActivityItems(message);
    expect(activity.map((i) => i.kind)).toEqual(['tool', 'text']);
    expect(activity[1]).toMatchObject({ kind: 'text', text: 'final answer' });
  });
});

describe('splitProcessAndFinal', () => {
  it('keeps trailing text outside the process fold', () => {
    const nodes = groupTimelineForView(
      [
        { kind: 'thought', id: 'th1', text: 'plan', startedAt: 1, ended: true, durationSec: 1 },
        {
          kind: 'tool',
          id: 't1',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        { kind: 'text', id: 'tx1', text: 'mid', ended: true },
        {
          kind: 'tool',
          id: 't2',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'b.ts' },
        },
        { kind: 'text', id: 'tx2', text: 'final answer', ended: true },
      ],
      t,
    );
    const { process, final } = splitProcessAndFinal(nodes);
    expect(process.map((n) => n.type)).toEqual(['thought', 'toolGroup', 'text', 'toolGroup']);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({ type: 'text', item: { text: 'final answer' } });
  });

  it('all-text turn has no process fold', () => {
    const { process, final } = splitProcessAndFinal(
      groupTimelineForView([{ kind: 'text', id: 'tx', text: 'hi', ended: true }], t),
    );
    expect(process).toEqual([]);
    expect(final).toHaveLength(1);
  });

  it('places pending mode_suggest in final after thought', () => {
    const nodes = groupTimelineForView(
      [
        { kind: 'thought', id: 'th1', text: '…', startedAt: 1, ended: true, durationSec: 1 },
        {
          kind: 'mode_suggest',
          id: 'sug-1',
          suggestedMode: 'debug',
          currentMode: 'ask',
          reason: 'User asked to switch',
          status: 'pending',
          startedAt: 1,
        },
      ],
      t,
    );
    const { process, final } = splitProcessAndFinal(nodes);
    expect(process.map((n) => n.type)).toEqual(['thought']);
    expect(final.map((n) => n.type)).toEqual(['mode_suggest']);
  });

  it('keeps trailing subagent / mode_suggest outside activity fold', () => {
    const nodes = groupTimelineForView(
      [
        {
          kind: 'tool',
          id: 't1',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        {
          kind: 'subagent',
          id: 'subagent-1',
          taskId: 'task-1',
          title: 'Explore',
          subagentType: 'explore',
          status: 'completed',
        },
        { kind: 'text', id: 'tx1', text: 'summary', ended: true },
      ],
      t,
    );
    const { process, final } = splitProcessAndFinal(nodes);
    expect(process.map((n) => n.type)).toEqual(['toolGroup']);
    expect(final.map((n) => n.type)).toEqual(['subagent', 'text']);
  });
});

describe('splitViewAroundUser', () => {
  it('inserts user between tool groups', () => {
    const nodes = groupTimelineForView(
      [
        {
          kind: 'tool',
          id: 't1',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'a.ts' },
        },
        { kind: 'user', id: 'u-steer', text: '你是什么模型' },
        {
          kind: 'tool',
          id: 't2',
          toolName: 'read',
          status: 'done',
          toolInput: { path: 'b.ts' },
        },
      ],
      t,
    );
    const segs = splitViewAroundUser(nodes);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ type: 'chunk' });
    expect(segs[1]).toMatchObject({ type: 'user', item: { id: 'u-steer' } });
    expect(segs[2]).toMatchObject({ type: 'chunk' });
  });
});
