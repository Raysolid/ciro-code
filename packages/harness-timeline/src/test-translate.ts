import type { TranslateFn } from './translate.js';

/** 测试用英文字典（镜像 harness-ui en 中工具组相关键） */
const EN: Record<string, string> = {
  'worked.seconds': 'Worked for {n}s',
  'worked.minutes': 'Worked for {n}m',
  'worked.minutesSeconds': 'Worked for {m}m {s}s',
  'tool.verb.read': 'Read',
  'tool.verb.grepped': 'Grepped',
  'tool.verb.listed': 'Listed',
  'tool.verb.wrote': 'Wrote',
  'tool.verb.edited': 'Edited',
  'tool.verb.ran': 'Ran',
  'tool.verb.deleted': 'Deleted',
  'tool.verb.fetched': 'Fetched',
  'tool.grepped.in': '{pattern} in {file}',
  'tool.target.files': 'files',
  'tool.target.command': 'command',
  'tool.target.snapshot': 'page snapshot',
  'tool.group.explored': 'Explored {parts}',
  'tool.group.file': '{n} file',
  'tool.group.files': '{n} files',
  'tool.group.search': '{n} search',
  'tool.group.searches': '{n} searches',
  'tool.group.edited': 'Edited {n} files',
  'tool.group.used': 'Used {n} tools',
  'tool.group.fetched': 'Fetched {n} pages',
};

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name]);
    }
    return match;
  });
}

export const testT: TranslateFn = (key, vars) => format(EN[key] ?? key, vars);
