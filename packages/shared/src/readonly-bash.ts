/**
 * Ask / Plan 模式下允许的只读 bash 命令（专文 §6.3）。
 * 支持 `&&` / `;` 链式与 `|` 管道：每一段都必须命中白名单。
 * 重定向写盘、命令替换、后台 `&`、`||` 默认拒绝。
 */

/** 写盘 / 替换 / 换行 —— 不可拆段放行 */
const BLOCK_UNSAFE = /[><`]|\$\(|\n/;

/** 去掉前导空白与常见环境前缀后的命令主体 */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/^\s*(?:sudo\s+)?/, '');
}

/** `||` 或非 `&&` 的单独 `&`（后台） */
function hasUnsafeAmpOrOr(cmd: string): boolean {
  if (/\|\|/.test(cmd)) return true;
  // 去掉 && 后再看是否还有 &
  return /&/.test(cmd.replace(/&&/g, ''));
}

function splitChain(cmd: string): string[] {
  return cmd
    .split(/\s*(?:&&|;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitPipe(cmd: string): string[] {
  return cmd
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ALLOWED: RegExp[] = [
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
  /^(?:ls|dir)(?:\s|$)/i,
  /^(?:cat|type|head|tail|wc)(?:\s|$)/i,
  /^pwd(?:\s|$)/i,
  /^(?:which|where)\s+/i,
  // Windows / pwsh 探索（本机默认 shell）
  /^Get-ChildItem(?:\s|$)/i,
  /^Get-Content(?:\s|$)/i,
  /^Select-String(?:\s|$)/i,
  /^Select-Object(?:\s|$)/i,
];

const GIT_WRITE =
  /^git\s+(commit|push|pull|fetch|rebase|merge|checkout|switch|add|reset|clean)\b/i;
const GIT_STASH_WRITE = /^git\s+stash(?!\s+(?:list|show)\b)/i;
const GIT_REMOTE_WRITE = /^git\s+remote\s+(?:add|remove|rm|rename|set-url|prune)\b/i;

function isAllowedSegment(segment: string): boolean {
  if (!segment || BLOCK_UNSAFE.test(segment)) return false;
  if (GIT_WRITE.test(segment) || GIT_STASH_WRITE.test(segment) || GIT_REMOTE_WRITE.test(segment)) {
    return false;
  }
  return ALLOWED.some((re) => re.test(segment));
}

export function isReadonlyBashCommand(command: string): boolean {
  const raw = normalizeCommand(command);
  if (!raw) return false;
  if (BLOCK_UNSAFE.test(raw) || hasUnsafeAmpOrOr(raw)) return false;

  const chain = splitChain(raw);
  if (chain.length === 0) return false;

  return chain.every((part) => {
    const pipes = splitPipe(part);
    return pipes.length > 0 && pipes.every(isAllowedSegment);
  });
}
