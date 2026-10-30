/**
 * 工具组摘要等文案键（由调用方 TranslateFn 解析）。
 * 集中列出，避免归约层硬编码英文展示串。
 */
export const TOOL_LABEL_KEYS = {
  verbRead: 'tool.verb.read',
  verbFetched: 'tool.verb.fetched',
  verbGrepped: 'tool.verb.grepped',
  verbListed: 'tool.verb.listed',
  verbWrote: 'tool.verb.wrote',
  verbEdited: 'tool.verb.edited',
  verbDeleted: 'tool.verb.deleted',
  verbRan: 'tool.verb.ran',
  greppedIn: 'tool.grepped.in',
  targetFiles: 'tool.target.files',
  targetCommand: 'tool.target.command',
  targetSnapshot: 'tool.target.snapshot',
  groupFetched: 'tool.group.fetched',
  groupFile: 'tool.group.file',
  groupFiles: 'tool.group.files',
  groupSearch: 'tool.group.search',
  groupSearches: 'tool.group.searches',
  groupExplored: 'tool.group.explored',
  groupEdited: 'tool.group.edited',
  groupUsed: 'tool.group.used',
  workedSeconds: 'worked.seconds',
  workedMinutes: 'worked.minutes',
  workedMinutesSeconds: 'worked.minutesSeconds',
} as const;

export type ToolLabelKey = (typeof TOOL_LABEL_KEYS)[keyof typeof TOOL_LABEL_KEYS];
