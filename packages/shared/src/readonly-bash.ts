/**
 * Ask / Plan 模式下 bash 分类（专文 §6.3；对齐 Claude Code 只读拆段口径）。
 * - readonly：只读白名单 → 自动 allow
 * - mutating：写盘 / 改 git / 包管理变更等 → 硬 deny
 * - other：名单外且非明确写操作 → ask（权限卡片）
 *
 * 链式 `&&` / `||` / `;` / `|`：任一段 mutating → mutating；全段 readonly → readonly；否则 other。
 * 丢弃型重定向（`2>/dev/null`、`2>&1`、`NUL`）先剥离；真实写盘重定向 / 命令替换 / 后台 `&` 仍 mutating。
 */

export type ReadonlyBashClass = 'readonly' | 'mutating' | 'other';

/** 命令替换 / 换行 —— 不可拆段放行 */
const BLOCK_SUBSTITUTION = /[`\n]|\$\(/;

/** 写盘重定向（剥离丢弃型之后仍残留） */
const WRITE_REDIRECT = /(?:^|[^0-9])>{1,2}(?!&)/;

/** 去掉前导空白与常见环境前缀后的命令主体 */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/^\s*(?:sudo\s+)?/, '');
}

/**
 * 剥离不写盘的 FD 重定向（对齐 Claude：/dev/null、NUL、2>&1）。
 * 不处理 `> file` / `>> file`。
 */
function stripDiscardRedirects(cmd: string): string {
  return (
    cmd
      // &>/dev/null / &>NUL
      .replace(/(?:\&|>\&)\s*(?:\/dev\/null|NUL)\b/gi, ' ')
      // 2>/dev/null、>/dev/null、2>NUL、>NUL
      .replace(/\d*\s*>\s*(?:\/dev\/null|NUL)\b/gi, ' ')
      // 2>&1、>&2 等 FD 复制
      .replace(/\d*\s*>&\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** 去掉 && / || / 2>&1 后若仍有孤立 `&` → 后台执行 */
function hasBackgroundAmp(cmd: string): boolean {
  const withoutAndOr = cmd.replace(/&&/g, ' ').replace(/\|\|/g, ' ');
  const withoutFd = withoutAndOr.replace(/\d*>&\d+/g, ' ');
  return /&/.test(withoutFd);
}

function splitChain(cmd: string): string[] {
  return cmd
    .split(/\s*(?:&&|\|\||;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 按 `|` 拆管道，忽略引号内的 `|`（如 `grep -E "a|b"`） */
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

const ALLOWED: RegExp[] = [
  // 探索导航 / 语义中性（Claude BASH_SEMANTIC_NEUTRAL + cd）
  /^cd(?:\s|$)/i,
  /^(?:echo|printf)(?:\s|$)/i,
  /^(?:true|false|:)\s*$/i,
  // 天然只读：词界即可（后缀参数仍只读）
  /^git\s+status\b/i,
  /^git\s+log\b/i,
  /^git\s+diff\b/i,
  /^git\s+show\b/i,
  /^git\s+blame\b/i,
  /^git\s+ls-files\b/i,
  /^git\s+rev-parse\b/i,
  /^git\s+shortlog\b/i,
  /^git\s+describe\b/i,
  // branch / remote：整段锚定，避免创建/删除/update 等写操作冒充前缀
  /^git\s+branch(?:\s+(?:-[arv]+|--list|--all|--remote))*\s*$/i,
  /^git\s+remote(?:\s+(?:-v|--verbose)|(?:\s+(?:show|get-url)(?:\s+\S+)*))?\s*$/i,
  /^git\s+config\s+(?:--get(?:-all|-regexp)?|--list|-l)\b/i,
  /^git\s+stash\s+(?:list|show)\b/i,
  /^(?:rg|grep)\s+/i,
  /^(?:find|fd)\s+/i,
  /^(?:ls|dir|tree|du)(?:\s|$)/i,
  /^(?:cat|type|head|tail|wc)(?:\s|$)/i,
  /^pwd(?:\s|$)/i,
  /^(?:which|where|where\.exe)\s+/i,
  // Windows / pwsh 探索（本机默认 shell）
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

const GIT_WRITE =
  /^git\s+(commit|push|pull|fetch|rebase|merge|checkout|switch|add|reset|clean)\b/i;
const GIT_STASH_WRITE = /^git\s+stash(?!\s+(?:list|show)\b)/i;
const GIT_REMOTE_WRITE = /^git\s+remote\s+(?:add|remove|rm|rename|set-url|prune)\b/i;

/** 明确写盘 / 改状态（Ask/Plan 硬 deny，不走权限卡） */
const MUTATING: RegExp[] = [
  GIT_WRITE,
  GIT_STASH_WRITE,
  GIT_REMOTE_WRITE,
  // 非只读列举的 git branch（创建/删除/改名等）
  /^git\s+branch\b/i,
  /^git\s+remote\b/i,
  /^git\s+config\b/i,
  /^git\s+stash\b/i,
  /^(?:rm|rmdir|del|erase|Remove-Item)(?:\s|$)/i,
  /^(?:mv|move|Rename-Item)(?:\s|$)/i,
  /^(?:cp|copy|Copy-Item)(?:\s|$)/i,
  /^(?:mkdir|md|New-Item|ni|touch)(?:\s|$)/i,
  /^(?:chmod|chown|chgrp|ln|link|tee)(?:\s|$)/i,
  /^(?:Set-Content|Add-Content|Out-File|Clear-Content|Set-Item)(?:\s|$)/i,
  /^(?:npm|pnpm|yarn|bun)\s+(?:install|ci|add|remove|uninstall|update|upgrade|publish|link|unlink)\b/i,
  /^sed\s+.*\s-i\b/i,
  /^perl\s+.*\s-i\b/i,
  /^find\b.*\s-(?:delete|exec|execdir)\b/i,
];

function segmentHasWriteRedirect(segment: string): boolean {
  return WRITE_REDIRECT.test(segment) || /<\(/.test(segment);
}

function isAllowedSegment(segment: string): boolean {
  if (!segment || BLOCK_SUBSTITUTION.test(segment) || segmentHasWriteRedirect(segment)) {
    return false;
  }
  if (GIT_WRITE.test(segment) || GIT_STASH_WRITE.test(segment) || GIT_REMOTE_WRITE.test(segment)) {
    return false;
  }
  // find/fd 写类开关：虽命中 find 前缀，不算只读
  if (/^(?:find|fd)\b/i.test(segment) && /\s-(?:delete|exec|execdir)\b/i.test(segment)) {
    return false;
  }
  return ALLOWED.some((re) => re.test(segment));
}

function isMutatingSegment(segment: string): boolean {
  if (!segment) return true;
  if (BLOCK_SUBSTITUTION.test(segment) || segmentHasWriteRedirect(segment)) return true;
  if (MUTATING.some((re) => re.test(segment))) {
    // 只读列举的 git branch/remote/config/stash 变体优先放行
    if (isAllowedSegment(segment)) return false;
    return true;
  }
  return false;
}

export function isReadonlyBashCommand(command: string): boolean {
  return classifyBashForReadonlyMode(command) === 'readonly';
}

/** Ask/Plan：明确写类 bash（含写盘重定向 / 命令替换 / 后台 &） */
export function isMutatingBashCommand(command: string): boolean {
  return classifyBashForReadonlyMode(command) === 'mutating';
}

/**
 * Ask/Plan bash 三分：readonly | mutating | other。
 * other 由 Policy 升为 ask（权限卡片 / 可加入 shell allowlist）。
 */
export function classifyBashForReadonlyMode(command: string): ReadonlyBashClass {
  const raw = normalizeCommand(command);
  if (!raw) return 'other';
  if (BLOCK_SUBSTITUTION.test(raw)) return 'mutating';

  const stripped = stripDiscardRedirects(raw);
  if (!stripped) return 'other';
  if (hasBackgroundAmp(stripped)) return 'mutating';
  if (segmentHasWriteRedirect(stripped)) return 'mutating';

  const chain = splitChain(stripped);
  if (chain.length === 0) return 'other';

  let allReadonly = true;
  for (const part of chain) {
    const pipes = splitPipe(part);
    if (pipes.length === 0) {
      allReadonly = false;
      continue;
    }
    for (const seg of pipes) {
      if (isMutatingSegment(seg)) return 'mutating';
      if (!isAllowedSegment(seg)) allReadonly = false;
    }
  }
  return allReadonly ? 'readonly' : 'other';
}
