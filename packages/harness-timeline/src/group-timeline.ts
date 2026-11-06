import type { ChatMessage } from './chat-message.js';
import type { TranslateFn } from './translate.js';
import { isShellTool, isWriteEditTool, toolGroupSummary } from './tool-label.js';
import type {
  DiffTimelineItem,
  ModeSuggestTimelineItem,
  AskQuestionTimelineItem,
  PlanTimelineItem,
  SubagentTimelineItem,
  TextTimelineItem,
  ThoughtTimelineItem,
  TimelineItem,
  ToolTimelineItem,
  UserTimelineItem,
} from './types.js';

export type TimelineViewNode =
  | { type: 'thought'; item: ThoughtTimelineItem }
  | { type: 'text'; item: TextTimelineItem }
  | {
      type: 'toolGroup';
      id: string;
      tools: ToolTimelineItem[];
      diffs: DiffTimelineItem[];
      summary: string;
    }
  | { type: 'diff'; item: DiffTimelineItem }
  | { type: 'mode_suggest'; item: ModeSuggestTimelineItem }
  | { type: 'ask_question'; item: AskQuestionTimelineItem }
  | { type: 'plan'; item: PlanTimelineItem }
  | { type: 'subagent'; item: SubagentTimelineItem }
  | { type: 'user'; item: UserTimelineItem };

/** 旧会话无 text part 时，把 content 合成末尾 text */
export function timelineActivityItems(message: ChatMessage): TimelineItem[] {
  const raw = message.timeline ?? [];
  const activity = raw.filter((i) => i.kind !== 'worked');
  const hasText = activity.some((i) => i.kind === 'text');
  if (!hasText && message.content.trim()) {
    return [
      ...activity,
      {
        kind: 'text',
        id: `text-legacy-${message.id}`,
        text: message.content,
        ended: true,
      },
    ];
  }
  return activity;
}

/**
 * 末段正文与独立卡片（mode_suggest / ask_question / plan / subagent）放到 Worked for 折叠外；
 * thought / toolGroup / diff 留在过程区；中间夹在工具之间的 text 仍留在过程区。
 */
export function splitProcessAndFinal(nodes: TimelineViewNode[]): {
  process: TimelineViewNode[];
  final: TimelineViewNode[];
} {
  const isActivity = (t: TimelineViewNode['type']) =>
    t === 'thought' || t === 'toolGroup' || t === 'diff';

  let lastActivity = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    if (isActivity(nodes[i]!.type)) lastActivity = i;
  }
  if (lastActivity < 0) {
    return { process: [], final: nodes };
  }
  return {
    process: nodes.slice(0, lastActivity + 1),
    final: nodes.slice(lastActivity + 1),
  };
}

/** Steer 用户气泡打断过程折叠，按插入点分段 */
type ViewSeg =
  | { type: 'user'; item: UserTimelineItem }
  | { type: 'chunk'; nodes: TimelineViewNode[] };

export function splitViewAroundUser(nodes: TimelineViewNode[]): ViewSeg[] {
  const out: ViewSeg[] = [];
  let buf: TimelineViewNode[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    out.push({ type: 'chunk', nodes: buf });
    buf = [];
  };
  for (const n of nodes) {
    if (n.type === 'user') {
      flush();
      out.push({ type: 'user', item: n.item });
    } else {
      buf.push(n);
    }
  }
  flush();
  return out;
}

/** 消费紧随某 tool 的归属 diff（同 toolCallId，或无 id 的紧随 diff） */
function takeTrailingDiffs(
  items: TimelineItem[],
  start: number,
  toolId: string,
): { diffs: DiffTimelineItem[]; next: number } {
  const diffs: DiffTimelineItem[] = [];
  let i = start;
  while (i < items.length) {
    const cur = items[i]!;
    if (cur.kind !== 'diff') break;
    if (cur.toolCallId === toolId || !cur.toolCallId) {
      diffs.push(cur);
      i += 1;
      continue;
    }
    break;
  }
  return { diffs, next: i };
}

function pushToolGroup(
  out: TimelineViewNode[],
  tools: ToolTimelineItem[],
  diffs: DiffTimelineItem[],
  t: TranslateFn,
) {
  if (tools.length === 0) {
    for (const d of diffs) out.push({ type: 'diff', item: d });
    return;
  }
  out.push({
    type: 'toolGroup',
    id: `tg-${tools[0]!.id}`,
    tools,
    diffs: [],
    summary: toolGroupSummary(tools, t),
  });
  // diff 与 shell 一样独立露出，不进 Used tools / Explored 折叠
  for (const d of diffs) out.push({ type: 'diff', item: d });
}

/**
 * 连续非 shell tool 合成 toolGroup；
 * **shell / diff 始终单独成节点**（像正文一样露出）；
 * thought / text 打断分组。
 */
export function groupTimelineForView(items: TimelineItem[], t: TranslateFn): TimelineViewNode[] {
  const out: TimelineViewNode[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    if (item.kind === 'thought') {
      out.push({ type: 'thought', item });
      i += 1;
      continue;
    }
    if (item.kind === 'text') {
      out.push({ type: 'text', item });
      i += 1;
      continue;
    }
    if (item.kind === 'tool') {
      // shell：独立卡片，不与 Explored / Used tools 混组
      if (isShellTool(item.toolName)) {
        i += 1;
        const { diffs, next } = takeTrailingDiffs(items, i, item.id);
        i = next;
        pushToolGroup(out, [item], diffs, t);
        continue;
      }

      const tools: ToolTimelineItem[] = [];
      const diffs: DiffTimelineItem[] = [];
      const toolIds = new Set<string>();
      while (i < items.length) {
        const cur = items[i]!;
        if (cur.kind === 'tool') {
          if (isShellTool(cur.toolName)) break;
          if (isWriteEditTool(cur.toolName) && cur.status === 'done') {
            i += 1;
            continue;
          }
          tools.push(cur);
          toolIds.add(cur.id);
          i += 1;
          continue;
        }
        if (cur.kind === 'diff') {
          if (cur.toolCallId && toolIds.has(cur.toolCallId)) {
            diffs.push(cur);
            i += 1;
            continue;
          }
          // 紧随工具块、无 toolCallId 的 diff 并入本组
          if (!cur.toolCallId && tools.length > 0) {
            diffs.push(cur);
            i += 1;
            continue;
          }
          break;
        }
        break;
      }
      pushToolGroup(out, tools, diffs, t);
      continue;
    }
    if (item.kind === 'diff') {
      out.push({ type: 'diff', item });
      i += 1;
      continue;
    }
    if (item.kind === 'mode_suggest') {
      out.push({ type: 'mode_suggest', item });
      i += 1;
      continue;
    }
    if (item.kind === 'ask_question') {
      out.push({ type: 'ask_question', item });
      i += 1;
      continue;
    }
    if (item.kind === 'plan') {
      out.push({ type: 'plan', item });
      i += 1;
      continue;
    }
    if (item.kind === 'subagent') {
      out.push({ type: 'subagent', item });
      i += 1;
      continue;
    }
    if (item.kind === 'user') {
      out.push({ type: 'user', item });
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}
