/**
 * Ask / Plan 模式下 bash 分类（专文 §6.3；只读拆段口径）。
 * - readonly：只读白名单 → 自动 allow
 * - mutating：确定写盘 / 改工作区 git / 包管理变更等 → 硬 deny
 * - other：无法静态判定或名单外 → ask（权限卡片）
 *
 * 原则：mutating 只留给「确定会改状态」；命令替换 / 换行等不确定 → other。
 * 链式 `&&` / `||` / `;` / `&`（cmd 顺序衔接）/ `|`：任一段 mutating → mutating；全段 readonly → readonly；否则 other。
 * Windows `dir & echo` 的 `&` 是顺序衔接，不是后台，按链式拆段。
 */

export type ReadonlyBashClass = 'readonly' | 'mutating' | 'other';

export type BashClassReason =
  | 'allowlist'
  | 'write_redirect'
  | 'background_amp'
  | 'cmd_substitution'
  | 'newline'
  | 'git_write'
  | 'git_fetch'
  | 'git_branch_write'
  | 'git_remote_write'
  | 'git_config_write'
  | 'git_stash_write'
  | 'git_tag_write'
  | 'git_config_flag'
  | 'dangerous_env'
  | 'mutating_command'
  | 'dangerous_arg'
  | 'not_in_allowlist'
  | 'empty'
  | 'unwrap_failed';

export interface BashClassifyResult {
  verdict: ReadonlyBashClass;
  reason: BashClassReason;
  segment?: string;
}

const DANGEROUS_ENV =
  /^(?:PATH|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_[A-Z0-9_]+|GIT_EXTERNAL_DIFF|GIT_PAGER|PAGER|GIT_SSH_COMMAND|GIT_EDITOR|EDITOR|VISUAL|BASH_ENV|ENV)$/i;

function result(
  verdict: ReadonlyBashClass,
  reason: BashClassReason,
  segment?: string,
): BashClassifyResult {
  return segment !== undefined ? { verdict, reason, segment } : { verdict, reason };
}

/**
 * 引号感知：裸露 / 双引号内的 `` ` `` / `$(` → subst；引号外换行 → newline。
 * 单引号内忽略。
 */
function scanUncertainSyntax(cmd: string): 'cmd_substitution' | 'newline' | null {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === '\\' && i + 1 < cmd.length) {
        i += 1;
        continue;
      }
      if (ch === '"') {
        quote = null;
        continue;
      }
      if (ch === '`') return 'cmd_substitution';
      if (ch === '$' && cmd[i + 1] === '(') return 'cmd_substitution';
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '\n' || ch === '\r') return 'newline';
    if (ch === '`') return 'cmd_substitution';
    if (ch === '$' && cmd[i + 1] === '(') return 'cmd_substitution';
  }
  return null;
}

/**
 * 剥离不写盘的 FD 重定向（/dev/null、NUL、2>&1）。
 * 不处理 `> file` / `>> file`。
 */
function stripDiscardRedirects(cmd: string): string {
  return (
    cmd
      .replace(/(?:\&|>\&)\s*(?:\/dev\/null|NUL|\$null)\b/gi, ' ')
      .replace(/\d*\s*>\s*(?:\/dev\/null|NUL|\$null)\b/gi, ' ')
      .replace(/\d*\s*>&\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** 仅尾部后台 `&`（`sleep 10 &`）；中间 `&` 由 splitChain 当 cmd 顺序衔接 */
function hasTrailingBackgroundAmp(cmd: string): boolean {
  const trimmed = cmd.trimEnd();
  if (!trimmed.endsWith('&') || trimmed.endsWith('&&')) return false;
  return /(?:^|[^&])&\s*$/.test(trimmed);
}

/**
 * 按 `&&` / `||` / `;` / 单 `&` 拆链（引号外）。
 */
function splitChain(cmd: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === ';') {
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      continue;
    }
    if (ch === '&') {
      const next = cmd[i + 1];
      const prev = cmd[i - 1];
      if (next === '&') {
        const t = cur.trim();
        if (t) parts.push(t);
        cur = '';
        i += 1;
        continue;
      }
      if (prev === '>' || prev === '<' || prev === '|') {
        cur += ch;
        continue;
      }
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      continue;
    }
    if (ch === '|' && cmd[i + 1] === '|') {
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      i += 1;
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail) parts.push(tail);
  return parts;
}

/** 按 `|` 拆管道，忽略引号内的 `|` */
function splitPipe(cmd: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '|') {
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail) parts.push(tail);
  return parts;
}

/** 简易空白分词（引号成组） */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

type EnvStrip =
  | { ok: true; rest: string }
  | { ok: false; reason: 'dangerous_env' };

function stripLeadingEnvAssignments(cmd: string): EnvStrip {
  let rest = cmd.trim();
  while (true) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=([^\s]*)\s+/.exec(rest);
    if (!m) break;
    const name = m[1]!;
    if (DANGEROUS_ENV.test(name)) {
      return { ok: false, reason: 'dangerous_env' };
    }
    rest = rest.slice(m[0].length);
  }
  return { ok: true, rest };
}

type SudoStrip =
  | { ok: true; rest: string }
  | { ok: false; reason: 'unwrap_failed' };

function stripSudoPrefix(cmd: string): SudoStrip {
  let rest = cmd.trim();
  if (!/^sudo(?:\s|$)/i.test(rest)) return { ok: true, rest };
  rest = rest.replace(/^sudo\s+/i, '');
  // 跳过常见短选项与 -u user；遇未知长选项则失败
  while (rest) {
    if (/^-u\s+\S+\s+/i.test(rest)) {
      rest = rest.replace(/^-u\s+\S+\s+/i, '');
      continue;
    }
    if (/^--user=\S+\s+/i.test(rest)) {
      rest = rest.replace(/^--user=\S+\s+/i, '');
      continue;
    }
    if (/^-[nEHb]\s+/i.test(rest)) {
      rest = rest.replace(/^-[nEHb]\s+/i, '');
      continue;
    }
    if (/^--(?:non-interactive|preserve-env|help|version)\s+/i.test(rest)) {
      rest = rest.replace(/^--(?:non-interactive|preserve-env|help|version)\s+/i, '');
      continue;
    }
    if (/^--\s+/.test(rest)) {
      rest = rest.replace(/^--\s+/, '');
      break;
    }
    if (/^-/.test(rest)) {
      return { ok: false, reason: 'unwrap_failed' };
    }
    break;
  }
  return { ok: true, rest: rest.trim() };
}

type GitStrip =
  | { ok: true; rest: string }
  | { ok: false; reason: 'git_config_flag' };

/** 剥离 git 全局选项；遇 -c/--config → other */
function stripGitGlobalOptions(cmd: string): GitStrip {
  if (!/^git(?:\s|$)/i.test(cmd)) return { ok: true, rest: cmd };
  const tokens = tokenize(cmd);
  if (tokens.length === 0 || tokens[0]!.toLowerCase() !== 'git') {
    return { ok: true, rest: cmd };
  }
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t === '-c' || t === '--config') {
      return { ok: false, reason: 'git_config_flag' };
    }
    if (t.startsWith('-c') && t.length > 2) {
      return { ok: false, reason: 'git_config_flag' };
    }
    if (
      t === '-C' ||
      t === '--git-dir' ||
      t === '--work-tree' ||
      t === '--namespace'
    ) {
      i += 2;
      continue;
    }
    if (
      t.startsWith('--git-dir=') ||
      t.startsWith('--work-tree=') ||
      t.startsWith('--namespace=')
    ) {
      i += 1;
      continue;
    }
    if (
      t === '--no-pager' ||
      t === '--no-optional-locks' ||
      t === '--bare' ||
      t === '--literal-pathspecs' ||
      t === '--glob-pathspecs' ||
      t === '--noglob-pathspecs' ||
      t === '--icase-pathspecs'
    ) {
      i += 1;
      continue;
    }
    break;
  }
  const restTokens = ['git', ...tokens.slice(i)];
  return { ok: true, rest: restTokens.join(' ') };
}

const GIT_MUTATING_SUB =
  /^(?:commit|push|pull|rebase|merge|checkout|switch|add|reset|clean)\b/i;

function classifyGitSegment(segment: string): BashClassifyResult | null {
  if (!/^git(?:\s|$)/i.test(segment)) return null;
  const tokens = tokenize(segment);
  if (tokens.length === 0) return result('other', 'not_in_allowlist', segment);
  // tokens[0] === git after strip
  const sub = (tokens[1] ?? '').toLowerCase();
  if (!sub) return result('other', 'not_in_allowlist', segment);

  if (sub === 'fetch') {
    return result('other', 'git_fetch', segment);
  }
  if (GIT_MUTATING_SUB.test(sub)) {
    return result('mutating', 'git_write', segment);
  }

  if (sub === 'branch') {
    return classifyGitBranch(tokens, segment);
  }
  if (sub === 'remote') {
    return classifyGitRemote(tokens, segment);
  }
  if (sub === 'config') {
    return classifyGitConfig(tokens, segment);
  }
  if (sub === 'stash') {
    return classifyGitStash(tokens, segment);
  }
  if (sub === 'tag') {
    return classifyGitTag(tokens, segment);
  }

  // 天然只读子命令
  if (
    /^(?:status|log|diff|show|blame|ls-files|ls-tree|cat-file|rev-parse|shortlog|describe)$/i.test(
      sub,
    )
  ) {
    return result('readonly', 'allowlist', segment);
  }

  return result('other', 'not_in_allowlist', segment);
}

function classifyGitBranch(tokens: string[], segment: string): BashClassifyResult {
  const args = tokens.slice(2);
  const writeLong =
    /^(?:--delete|--move|--copy|--set-upstream-to|--unset-upstream|--edit-description|--track|--no-track)$/i;
  const readonlyPositionalFlag =
    /^(?:--contains|--no-contains|--merged|--no-merged|--points-at)$/i;
  let listIntent = false;
  let hasReadonlyPositional = false;
  for (const a of args) {
    if (writeLong.test(a) || /^--set-upstream-to=/i.test(a)) {
      return result('mutating', 'git_branch_write', segment);
    }
    // 短选项簇含写字母 d D m M c C u
    if (/^-[^-]/.test(a) && /[dDmMcCu]/.test(a.slice(1))) {
      return result('mutating', 'git_branch_write', segment);
    }
    if (readonlyPositionalFlag.test(a)) {
      hasReadonlyPositional = true;
      listIntent = true;
      continue;
    }
    if (
      a === '--list' ||
      a === '--all' ||
      a === '--remote' ||
      a === '--show-current' ||
      a === '--sort' ||
      a.startsWith('--sort=') ||
      a === '--format' ||
      a.startsWith('--format=') ||
      a === '--column' ||
      a.startsWith('--column=') ||
      /^-[arv]+$/i.test(a)
    ) {
      listIntent = true;
      continue;
    }
    if (a.startsWith('-')) {
      // 未知选项：不硬 deny
      continue;
    }
  }
  const createIntent = args.some((a) => !a.startsWith('-'));
  // `git branch foo` 创建；`git branch --contains x` 的位置参数随只读 flag
  if (createIntent && !listIntent && !hasReadonlyPositional) {
    return result('mutating', 'git_branch_write', segment);
  }
  return result('readonly', 'allowlist', segment);
}

function classifyGitRemote(tokens: string[], segment: string): BashClassifyResult {
  const args = tokens.slice(2);
  if (args.length === 0) return result('readonly', 'allowlist', segment);
  const head = args[0]!.toLowerCase();
  if (
    head === 'add' ||
    head === 'remove' ||
    head === 'rm' ||
    head === 'rename' ||
    head === 'set-url' ||
    head === 'prune' ||
    head === 'update'
  ) {
    return result('mutating', 'git_remote_write', segment);
  }
  if (head === '-v' || head === '--verbose' || head === 'show' || head === 'get-url') {
    return result('readonly', 'allowlist', segment);
  }
  return result('other', 'not_in_allowlist', segment);
}

function classifyGitConfig(tokens: string[], segment: string): BashClassifyResult {
  const args = tokens.slice(2);
  if (args.length === 0) return result('other', 'not_in_allowlist', segment);
  const head = args[0]!;
  if (
    head === '--get' ||
    head === '--get-all' ||
    head === '--get-regexp' ||
    head === '--list' ||
    head === '-l'
  ) {
    return result('readonly', 'allowlist', segment);
  }
  if (
    head === '--unset' ||
    head === '--unset-all' ||
    head === '--replace-all' ||
    head === '--add' ||
    head === '--edit' ||
    head === '-e' ||
    head === '--remove-section'
  ) {
    return result('mutating', 'git_config_write', segment);
  }
  // `git config user.name` 等形式视为写
  if (!head.startsWith('-')) {
    return result('mutating', 'git_config_write', segment);
  }
  return result('other', 'not_in_allowlist', segment);
}

function classifyGitStash(tokens: string[], segment: string): BashClassifyResult {
  const sub = (tokens[2] ?? '').toLowerCase();
  if (sub === 'list' || sub === 'show') {
    return result('readonly', 'allowlist', segment);
  }
  if (!sub) return result('mutating', 'git_stash_write', segment);
  return result('mutating', 'git_stash_write', segment);
}

function classifyGitTag(tokens: string[], segment: string): BashClassifyResult {
  const args = tokens.slice(2);
  if (args.length === 0) return result('readonly', 'allowlist', segment);
  for (const a of args) {
    if (
      a === '-d' ||
      a === '--delete' ||
      a === '-a' ||
      a === '--annotate' ||
      a === '-s' ||
      a === '--sign' ||
      a === '-m' ||
      a === '--message' ||
      a.startsWith('--message=') ||
      a === '-f' ||
      a === '--force'
    ) {
      return result('mutating', 'git_tag_write', segment);
    }
  }
  if (args.some((a) => a === '-l' || a === '--list' || a.startsWith('--list='))) {
    return result('readonly', 'allowlist', segment);
  }
  // `git tag v1` 创建 → mutating；`git tag` 已处理
  if (args.some((a) => !a.startsWith('-'))) {
    return result('mutating', 'git_tag_write', segment);
  }
  return result('readonly', 'allowlist', segment);
}

const SIMPLE_READONLY: RegExp[] = [
  /^cd(?:\s|$)/i,
  /^(?:echo|printf)(?:\s|$)/i,
  /^(?:true|false|:)\s*$/i,
  /^(?:rg|grep)\s+/i,
  /^(?:findstr)(?:\.exe)?\b/i,
  /^(?:ls|dir|tree|du|df)(?:\s|$)/i,
  /^(?:cat|type|head|tail|wc|file|stat|date)(?:\s|$)/i,
  /^(?:sort|uniq|cut|tr)(?:\s|$)/i,
  /^(?:pwd|printenv)(?:\s|$)/i,
  /^(?:which|where|where\.exe)\s+/i,
  /^Get-ChildItem(?:\s|$)/i,
  /^Get-Content(?:\s|$)/i,
  /^Select-String(?:\s|$)/i,
  /^Select-Object(?:\s|$)/i,
  /^Test-Path(?:\s|$)/i,
  /^Get-Location(?:\s|$)/i,
  /^Set-Location(?:\s|$)/i,
  /^Write-Output(?:\s|$)/i,
  /^Write-Host(?:\s|$)/i,
];

const MUTATING_CMDS: RegExp[] = [
  /^(?:rm|rmdir|del|erase|Remove-Item)(?:\s|$)/i,
  /^(?:mv|move|Rename-Item)(?:\s|$)/i,
  /^(?:cp|copy|Copy-Item)(?:\s|$)/i,
  /^(?:mkdir|md|New-Item|ni|touch)(?:\s|$)/i,
  /^(?:chmod|chown|chgrp|ln|link|tee)(?:\s|$)/i,
  /^(?:Set-Content|Add-Content|Out-File|Clear-Content|Set-Item)(?:\s|$)/i,
  /^(?:npm|pnpm|yarn|bun)\s+(?:install|ci|add|remove|uninstall|update|upgrade|publish|link|unlink)\b/i,
  /^sed\s+.*\s-i\b/i,
  /^perl\s+.*\s-i\b/i,
];

function hasDangerousReadonlyArgs(segment: string): boolean {
  if (/^(?:find|fd)\b/i.test(segment)) {
    if (/\s-(?:delete|exec|execdir|ok|fprint|fls|fprint0)\b/i.test(segment)) return true;
  }
  if (/^sort\b/i.test(segment) && /(^|\s)-o(?:\s|=)/i.test(segment)) return true;
  if (/^rg\b/i.test(segment) && /\s--pre(?:\s|=)/i.test(segment)) return true;
  if (/^git\s+diff\b/i.test(segment) && /\s--output(?:=|\s)/i.test(segment)) return true;
  if (/^git\s+log\b/i.test(segment) && /\s--output(?:=|\s)/i.test(segment)) return true;
  return false;
}

/** 引号外写盘重定向 / process subst；含 > >> >| &> &>> */
function segmentHasWriteRedirect(segment: string): boolean {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < segment.length) {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    // <( process substitution
    if (ch === '<' && segment[i + 1] === '(') return true;
    if (ch === '&' && segment[i + 1] === '>') return true;
    if (ch === '>') {
      // FD 复制 >&N 不算写盘
      if (segment[i + 1] === '&') continue;
      return true;
    }
  }
  return false;
}

function classifySimpleSegment(segment: string): BashClassifyResult {
  if (!segment) return result('other', 'empty', segment);
  if (segmentHasWriteRedirect(segment)) {
    return result('mutating', 'write_redirect', segment);
  }
  const uncertain = scanUncertainSyntax(segment);
  if (uncertain) return result('other', uncertain, segment);

  if (hasDangerousReadonlyArgs(segment)) {
    return result('mutating', 'dangerous_arg', segment);
  }

  const git = classifyGitSegment(segment);
  if (git) return git;

  if (/^(?:find|fd)\s+/i.test(segment)) {
    return result('readonly', 'allowlist', segment);
  }

  for (const re of MUTATING_CMDS) {
    if (re.test(segment)) return result('mutating', 'mutating_command', segment);
  }

  // env 无赋值：`env cmd` → 递归；`env` / `env -i` 单独 → other
  if (/^env(?:\s|$)/i.test(segment)) {
    return classifyEnvWrapper(segment);
  }

  for (const re of SIMPLE_READONLY) {
    if (re.test(segment)) return result('readonly', 'allowlist', segment);
  }

  return result('other', 'not_in_allowlist', segment);
}

function classifyEnvWrapper(segment: string): BashClassifyResult {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return result('other', 'not_in_allowlist', segment);
  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t === '-i' || t === '--ignore-environment' || t === '-0' || t === '-u') {
      if (t === '-u') {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (t.startsWith('-')) {
      return result('other', 'not_in_allowlist', segment);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      const name = t.slice(0, t.indexOf('='));
      if (DANGEROUS_ENV.test(name)) {
        return result('other', 'dangerous_env', segment);
      }
      i += 1;
      continue;
    }
    break;
  }
  const inner = tokens.slice(i).join(' ');
  if (!inner) return result('other', 'not_in_allowlist', segment);
  return classifySimpleSegment(inner);
}

/** timeout / time / nice 剥一层 */
function tryUnwrapWrapper(segment: string): string | null {
  const tokens = tokenize(segment);
  if (tokens.length < 2) return null;
  const head = tokens[0]!.toLowerCase();
  if (head === 'timeout') {
    // timeout [opts] DURATION command
    let i = 1;
    while (i < tokens.length && tokens[i]!.startsWith('-')) {
      // -s SIGNAL / --signal= etc take value sometimes
      if (/^-(?:s|-signal)$/i.test(tokens[i]!) || tokens[i] === '-k' || tokens[i] === '--kill-after') {
        i += 2;
        continue;
      }
      i += 1;
    }
    // duration
    if (i < tokens.length) i += 1;
    const inner = tokens.slice(i).join(' ');
    return inner || null;
  }
  if (head === 'time' || head === 'nice') {
    let i = 1;
    while (i < tokens.length && tokens[i]!.startsWith('-')) {
      i += 1;
    }
    const inner = tokens.slice(i).join(' ');
    return inner || null;
  }
  return null;
}

function extractShellDashC(cmd: string): string | null {
  // bash -c / sh -c / bash -lc
  const m = /^(?:bash|sh|zsh|dash)(?:\.exe)?(?:\s+-[a-zA-Z]*)?\s+-c\s+/i.exec(cmd);
  if (!m) return null;
  let rest = cmd.slice(m[0].length).trim();
  if (
    (rest.startsWith('"') && rest.endsWith('"')) ||
    (rest.startsWith("'") && rest.endsWith("'"))
  ) {
    rest = rest.slice(1, -1);
  }
  return rest;
}

function extractCmdSlashC(cmd: string): string | null {
  const m = /^(?:cmd(?:\.exe)?)\s+(?:\/[cCkK])\s+/i.exec(cmd);
  if (!m) return null;
  let rest = cmd.slice(m[0].length).trim();
  if (
    (rest.startsWith('"') && rest.endsWith('"')) ||
    (rest.startsWith("'") && rest.endsWith("'"))
  ) {
    rest = rest.slice(1, -1);
  }
  return rest;
}

/**
 * 抽取 `powershell`/`pwsh … -Command/-c …` 的脚本正文。
 * 命中包装器但无 -Command 时返回 ''（由调用方标 other）。
 */
function extractPowershellCommand(cmd: string): string | null {
  if (!/^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i.test(cmd)) return null;
  const flag = /\s-(?:Command|c)\s+/i.exec(cmd);
  if (!flag || flag.index == null) return '';
  let rest = cmd.slice(flag.index + flag[0].length).trim();
  if (
    (rest.startsWith('"') && rest.endsWith('"')) ||
    (rest.startsWith("'") && rest.endsWith("'"))
  ) {
    rest = rest.slice(1, -1);
  }
  return rest;
}

/** PS 转义与 `$()` 子表达式：不当作 bash 命令替换 */
function normalizePowershellScript(script: string): string {
  return script.replace(/`./g, ' ').replace(/\$\((?:[^()]|\([^()]*\))*\)/g, '_');
}

function mergeVerdicts(parts: BashClassifyResult[]): BashClassifyResult {
  if (parts.length === 0) return result('other', 'empty');
  for (const p of parts) {
    if (p.verdict === 'mutating') return p;
  }
  if (parts.every((p) => p.verdict === 'readonly')) {
    return result('readonly', 'allowlist');
  }
  const other = parts.find((p) => p.verdict === 'other');
  return other ?? result('other', 'not_in_allowlist');
}

function classifySegmentDetailed(segment: string): BashClassifyResult {
  const unwrapped = tryUnwrapWrapper(segment);
  if (unwrapped != null) {
    return classifySegmentDetailed(unwrapped);
  }

  const dashC = extractShellDashC(segment);
  if (dashC != null) {
    if (!dashC.trim()) return result('other', 'unwrap_failed', segment);
    return classifyBashBodyDetailed(dashC);
  }
  const cmdC = extractCmdSlashC(segment);
  if (cmdC != null) {
    if (!cmdC.trim()) return result('other', 'unwrap_failed', segment);
    return classifyBashBodyDetailed(cmdC);
  }

  return classifySimpleSegment(segment);
}

function classifyBashBodyDetailed(raw: string): BashClassifyResult {
  // 换行 / 命令替换须在空白折叠前扫描（stripDiscardRedirects 会把 \n 压成空格）
  const uncertainRaw = scanUncertainSyntax(raw);
  if (uncertainRaw) return result('other', uncertainRaw, raw);

  const stripped = stripDiscardRedirects(raw);
  if (!stripped) return result('other', 'empty');

  if (hasTrailingBackgroundAmp(stripped)) {
    return result('mutating', 'background_amp', stripped);
  }
  if (segmentHasWriteRedirect(stripped)) {
    return result('mutating', 'write_redirect', stripped);
  }

  const chain = splitChain(stripped);
  if (chain.length === 0) return result('other', 'empty');

  const partResults: BashClassifyResult[] = [];
  for (const part of chain) {
    const pipes = splitPipe(part);
    if (pipes.length === 0) {
      partResults.push(result('other', 'empty'));
      continue;
    }
    for (const seg of pipes) {
      partResults.push(classifySegmentDetailed(seg));
    }
  }
  return mergeVerdicts(partResults);
}

function normalizeLeading(command: string): BashClassifyResult | { cmd: string } {
  let rest = command.trim();
  if (!rest) return result('other', 'empty');

  const sudo = stripSudoPrefix(rest);
  if (!sudo.ok) return result('other', sudo.reason);
  rest = sudo.rest;

  const env = stripLeadingEnvAssignments(rest);
  if (!env.ok) return result('other', env.reason);
  rest = env.rest;

  const git = stripGitGlobalOptions(rest);
  if (!git.ok) return result('other', git.reason);
  rest = git.rest;

  return { cmd: rest };
}

/**
 * Ask/Plan bash 三分（带原因码）。
 */
export function classifyBashForReadonlyModeDetailed(
  command: string,
): BashClassifyResult {
  const norm = normalizeLeading(command);
  if (!('cmd' in norm)) return norm;
  const raw = norm.cmd;
  if (!raw) return result('other', 'empty');

  const psInner = extractPowershellCommand(raw);
  if (psInner != null) {
    if (!psInner.trim()) return result('other', 'unwrap_failed', raw);
    return classifyBashBodyDetailed(normalizePowershellScript(psInner));
  }

  // bash -c / cmd /c 在顶层也支持
  const dashC = extractShellDashC(raw);
  if (dashC != null) {
    if (!dashC.trim()) return result('other', 'unwrap_failed', raw);
    return classifyBashBodyDetailed(dashC);
  }
  const cmdC = extractCmdSlashC(raw);
  if (cmdC != null) {
    if (!cmdC.trim()) return result('other', 'unwrap_failed', raw);
    return classifyBashBodyDetailed(cmdC);
  }

  return classifyBashBodyDetailed(raw);
}

/**
 * Ask/Plan bash 三分：readonly | mutating | other。
 * other 由 Policy 升为 ask（权限卡片 / 可加入 shell allowlist）。
 */
export function classifyBashForReadonlyMode(command: string): ReadonlyBashClass {
  return classifyBashForReadonlyModeDetailed(command).verdict;
}

export function isReadonlyBashCommand(command: string): boolean {
  return classifyBashForReadonlyMode(command) === 'readonly';
}

/** Ask/Plan：明确写类 bash（含写盘重定向 / 后台 &） */
export function isMutatingBashCommand(command: string): boolean {
  return classifyBashForReadonlyMode(command) === 'mutating';
}
