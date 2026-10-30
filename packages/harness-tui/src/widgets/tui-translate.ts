import type { MessageVars, TranslateFn } from '@ciro-code/harness-timeline';

/** TUI 精简英文字典（对齐 Web tool label 键，避免裸 key 露出） */
const EN: Record<string, string> = {
  'tool.verb.read': 'Read',
  'tool.verb.fetched': 'Fetched',
  'tool.verb.grepped': 'Grepped',
  'tool.verb.listed': 'Listed',
  'tool.verb.wrote': 'Wrote',
  'tool.verb.edited': 'Edited',
  'tool.verb.deleted': 'Deleted',
  'tool.verb.ran': 'Ran',
  'tool.grepped.in': '{pattern} in {file}',
  'tool.target.files': 'files',
  'tool.target.command': 'command',
  'tool.target.snapshot': 'snapshot',
  'tool.group.fetched': 'Fetched {n} pages',
  'tool.group.file': '{n} file',
  'tool.group.files': '{n} files',
  'tool.group.search': '{n} search',
  'tool.group.searches': '{n} searches',
  'tool.group.explored': 'Explored {parts}',
  'tool.group.edited': 'Edited {n} files',
  'tool.group.used': 'Used {n} tools',
};

function fill(template: string, vars?: MessageVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

export const tuiTranslate: TranslateFn = (key, vars) => {
  const tpl = EN[key];
  if (tpl) return fill(tpl, vars);
  return fill(key, vars);
};
