import {
  ASK_DENIED_TOOLS,
  EXPLORE_DISALLOWED_TOOLS,
  MODE_TOOL_WHITELIST,
  PRESET_TOOL_WHITELIST,
  defaultPresetForMode,
  isReadonlyBashCommand,
  type HarnessMode,
  type PermissionPreset,
  type PolicyContext,
  type PolicyDecision,
  type PolicyResult,
} from '@ciro/harness-shared';
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath, normalize } from 'node:path';
import { isMcpToolName, isMcpWriteClassTool } from '../mcp/mcp-manager.js';
import { isExtToolName } from '../extensions/extension-host.js';

export type PolicyRule = (ctx: PolicyContext) => PolicyResult | null;

function commandOf(ctx: PolicyContext): string {
  const input = ctx.toolInput ?? {};
  const cmd = input.command ?? input.cmd ?? '';
  return typeof cmd === 'string' ? cmd : '';
}

function isReadonlyMode(mode: string): boolean {
  return mode === 'ask' || mode === 'plan';
}

function pathOf(ctx: PolicyContext): string {
  const p = ctx.toolInput?.path;
  return typeof p === 'string' ? p : '';
}

function strArg(input: Record<string, unknown> | undefined, key: string): string {
  const v = input?.[key];
  return typeof v === 'string' ? v : '';
}

function hasDebugProbes(text: string): boolean {
  return (
    /#region\s+agent\s+log/i.test(text) ||
    /X-Debug-Session-Id/i.test(text) ||
    /\/ingest\/[a-f0-9-]{8,}/i.test(text)
  );
}

function readWorkspaceFile(ctx: PolicyContext): string | null {
  const rel = pathOf(ctx);
  if (!rel || !ctx.workspace) return null;
  try {
    const abs = resolvePath(ctx.workspace, rel);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

function proposedFileAfter(ctx: PolicyContext, before: string): string | null {
  const input = ctx.toolInput;
  if (ctx.toolName === 'write') {
    if (!input || !('content' in input)) return null;
    return strArg(input, 'content');
  }
  if (ctx.toolName === 'edit') {
    const neu = strArg(input, 'new_string');
    const old = strArg(input, 'old_string');
    if (old.length > 0) {
      const idx = before.indexOf(old);
      if (idx < 0) return null;
      return before.slice(0, idx) + neu + before.slice(idx + old.length);
    }
    return neu;
  }
  return null;
}

function samePath(a: string, b: string): boolean {
  return normalize(resolvePath(a)).toLowerCase() === normalize(resolvePath(b)).toLowerCase();
}

function isShellName(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'bash' || n === 'shell' || n === 'pwsh' || n === 'cmd';
}

function slash(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function isDebugLogRef(ctx: PolicyContext, value: string): boolean {
  if (!value) return false;
  const n = slash(value);
  if (ctx.debugLogPathRel && n.includes(slash(ctx.debugLogPathRel))) return true;
  if (ctx.debugLogPath && n.includes(slash(ctx.debugLogPath))) return true;
  return /(?:^|\/)debug-[a-z0-9]+\.log(?:\b|$)/i.test(n) || n.includes('.ciro/debug/');
}

/** Subagent 子循环：depth≥1 时硬拒写工具与嵌套 Task */
const subagentDepthDenyRule: PolicyRule = (ctx) => {
  if (!ctx.subagentDepth || ctx.subagentDepth < 1) return null;
  if ((EXPLORE_DISALLOWED_TOOLS as readonly string[]).includes(ctx.toolName)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Tool "${ctx.toolName}" is not allowed inside a subagent (maxDepth=1)`,
    };
  }
  return null;
};

/** 全 mode：curl/wget 不是联网方案，引导 WebFetch */
const bashEgressDenyRule: PolicyRule = (ctx) => {
  if (!isShellName(ctx.toolName)) return null;
  const cmd = commandOf(ctx);
  if (!cmd) return null;
  if (/\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/i.test(cmd)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason:
        'Outbound bash (curl/wget/Invoke-WebRequest) is denied. Use WebFetch or an enabled search MCP.',
    };
  }
  return null;
};

/** 硬 deny：危险 bash */
const dangerousBashDenyRule: PolicyRule = (ctx) => {
  if (ctx.toolName !== 'bash' && ctx.toolName !== 'shell') return null;
  const cmd = commandOf(ctx);
  if (!cmd) return null;

  const denyPatterns: Array<{ re: RegExp; reason: string }> = [
    { re: /\bgit\s+push\s+.*(--force|-f)\b/i, reason: 'Force push is denied' },
    { re: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\b/, reason: 'Destructive rm of root is denied' },
    { re: /\bmkfs\b/i, reason: 'mkfs is denied' },
    { re: /\bdd\s+.*\bif=/i, reason: 'dd with if= is denied' },
    { re: /\bformat\s+[a-z]:/i, reason: 'disk format is denied' },
    { re: /curl\s+[^|]*\|\s*(ba)?sh/i, reason: 'curl|sh pipe is denied' },
  ];

  for (const { re, reason } of denyPatterns) {
    if (re.test(cmd)) {
      return { decision: 'deny' as PolicyDecision, reason };
    }
  }
  return null;
};

/** Debug：禁止用 bash rm/del 清 debug log，必须用 delete_file */
const debugBashClearLogDenyRule: PolicyRule = (ctx) => {
  if (ctx.mode !== 'debug') return null;
  if (!isShellName(ctx.toolName)) return null;
  const cmd = commandOf(ctx);
  if (!cmd) return null;
  if (!/\b(rm|del|Remove-Item)\b/i.test(cmd)) return null;
  const hint = ctx.debugLogPathRel ?? 'debug-*.log';
  if (
    /debug-[a-z0-9]+\.log/i.test(cmd) ||
    /\.(ndjson|log)\b/i.test(cmd) ||
    (ctx.debugLogPathRel && cmd.includes(ctx.debugLogPathRel)) ||
    (ctx.debugLogPath && cmd.includes(ctx.debugLogPath))
  ) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Clear debug logs with delete_file on ${hint}, not bash rm`,
    };
  }
  return null;
};

/**
 * Debug 人在环：未 Proceed / Mark as fixed 前禁止读 session log。
 * 允许自跑测试/受测程序以产生 runtime 证据。
 */
const debugReproGateRule: PolicyRule = (ctx) => {
  if (ctx.mode !== 'debug' || ctx.debugAnalyzeUnlocked) return null;
  const reason =
    'Wait for the user to Proceed before reading the debug log in this turn.';
  if (ctx.toolName === 'read' || ctx.toolName === 'read_file' || ctx.toolName === 'grep') {
    if (isDebugLogRef(ctx, pathOf(ctx))) {
      return { decision: 'deny' as PolicyDecision, reason };
    }
  }
  if (isShellName(ctx.toolName)) {
    const cmd = commandOf(ctx);
    if (cmd && isDebugLogRef(ctx, cmd)) {
      return { decision: 'deny' as PolicyDecision, reason };
    }
  }
  return null;
};

const KEEP_PROBES_REASON =
  'Keep instrumentation until Mark as fixed or an explicit cleanup request. Apply the fix without removing #region agent log / ingest probes. Clear the session log with delete_file only.';

/**
 * Debug：Mark as fixed 前禁止剥掉探针，否则下一轮用户复现写不出 log。
 */
const debugKeepProbesRule: PolicyRule = (ctx) => {
  if (ctx.mode !== 'debug' || ctx.debugCleanupUnlocked) return null;
  if (ctx.toolName !== 'write' && ctx.toolName !== 'edit') return null;
  const old = strArg(ctx.toolInput, 'old_string');
  const before = readWorkspaceFile(ctx) ?? old;
  const after = proposedFileAfter(ctx, before);
  if (after == null) return null;
  if (hasDebugProbes(before) && !hasDebugProbes(after)) {
    return { decision: 'deny' as PolicyDecision, reason: KEEP_PROBES_REASON };
  }
  return null;
};

/** Debug：delete_file 仅允许本 session logPath */
const debugDeleteFileRule: PolicyRule = (ctx) => {
  if (ctx.toolName !== 'delete_file') return null;
  if (ctx.mode !== 'debug') {
    return {
      decision: 'deny' as PolicyDecision,
      reason: 'delete_file is only available in Debug mode',
    };
  }
  if (!ctx.debugLogPath && !ctx.debugLogPathRel) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: 'No active debug log path configured',
    };
  }
  const rel = pathOf(ctx);
  if (!rel) {
    return { decision: 'deny' as PolicyDecision, reason: 'delete_file requires path' };
  }
  const abs = resolvePath(ctx.workspace, rel);
  const allowedAbs = ctx.debugLogPath
    ? resolvePath(ctx.debugLogPath)
    : resolvePath(ctx.workspace, ctx.debugLogPathRel!);
  if (!samePath(abs, allowedAbs)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: 'delete_file may only target the current session debug log',
    };
  }
  return null;
};

/** Ask / Plan（Confirm 前）：硬拒写工具 */
const readonlyModeWriteDenyRule: PolicyRule = (ctx) => {
  if (!isReadonlyMode(ctx.mode)) return null;
  if ((ASK_DENIED_TOOLS as readonly string[]).includes(ctx.toolName)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Tool "${ctx.toolName}" is not allowed in ${ctx.mode} mode`,
    };
  }
  return null;
};

/**
 * Ask / Plan：bash 仅允许只读白名单命令。
 * shell 与 bash 同级处理。
 */
const readonlyModeBashRule: PolicyRule = (ctx) => {
  if (!isReadonlyMode(ctx.mode)) return null;
  if (ctx.toolName !== 'bash' && ctx.toolName !== 'shell') return null;
  const cmd = commandOf(ctx);
  if (!cmd.trim()) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Empty bash command is not allowed in ${ctx.mode} mode`,
    };
  }
  if (isReadonlyBashCommand(cmd)) return null;
  return {
    decision: 'deny' as PolicyDecision,
    reason: `Only readonly bash is allowed in ${ctx.mode} mode`,
  };
};

/** Ask / Plan：写类 MCP deny；其余 mcp:* 放行（绕过静态白名单） */
const mcpToolRule: PolicyRule = (ctx) => {
  if (!isMcpToolName(ctx.toolName)) return null;
  if (isReadonlyMode(ctx.mode) && isMcpWriteClassTool(ctx.toolName, ctx.readOnlyHint)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Write-class MCP tool "${ctx.toolName}" is not allowed in ${ctx.mode} mode`,
    };
  }
  return { decision: 'allow' as PolicyDecision };
};

/** Ask / Plan：readOnlyHint!==true 的 ext:* deny；subagent 禁用；其余放行 */
const extToolRule: PolicyRule = (ctx) => {
  if (!isExtToolName(ctx.toolName)) return null;
  if (ctx.subagentDepth && ctx.subagentDepth >= 1) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Extension tool "${ctx.toolName}" is not allowed inside a subagent`,
    };
  }
  if (isReadonlyMode(ctx.mode) && ctx.readOnlyHint !== true) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Write-class extension tool "${ctx.toolName}" is not allowed in ${ctx.mode} mode`,
    };
  }
  return { decision: 'allow' as PolicyDecision };
};

/**
 * Ask 父会话：Task 仅 explore（只读调研）。
 * verify/shell/browser 的 policyMode=agent，不适合 Ask。
 */
const askTaskExploreOnlyRule: PolicyRule = (ctx) => {
  if (ctx.mode !== 'ask' || ctx.toolName !== 'Task') return null;
  const subtype = ctx.toolInput?.subagent_type;
  if (subtype === 'explore') return null;
  return {
    decision: 'deny' as PolicyDecision,
    reason:
      'Ask mode may only use Task(explore); switch to Agent for verify/shell/browser',
  };
};

/** Plan：允许 verify/shell，硬拒 browser（L3 交互浏览仅 Agent/Debug） */
const planTaskNoBrowserRule: PolicyRule = (ctx) => {
  if (ctx.mode !== 'plan' || ctx.toolName !== 'Task') return null;
  if (ctx.toolInput?.subagent_type !== 'browser') return null;
  return {
    decision: 'deny' as PolicyDecision,
    reason: 'Plan mode cannot use Task(browser); switch to Agent',
  };
};

/** mode 白名单 */
const modeWhitelistRule: PolicyRule = (ctx) => {
  const allowed = MODE_TOOL_WHITELIST[ctx.mode as HarnessMode] ?? MODE_TOOL_WHITELIST.ask;
  if (!allowed.includes(ctx.toolName)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Tool "${ctx.toolName}" is not in the whitelist for ${ctx.mode} mode`,
    };
  }
  return null;
};

/** preset 白名单 */
const presetWhitelistRule: PolicyRule = (ctx) => {
  const preset: PermissionPreset = ctx.preset ?? defaultPresetForMode(ctx.mode);
  const allowed = PRESET_TOOL_WHITELIST[preset];
  if (!allowed.includes(ctx.toolName)) {
    return {
      decision: 'deny' as PolicyDecision,
      reason: `Tool "${ctx.toolName}" is not allowed by preset ${preset}`,
    };
  }
  return null;
};

/** ask 规则：敏感但非毁灭性操作需确认 */
const sensitiveAskRule: PolicyRule = (ctx) => {
  if (isReadonlyMode(ctx.mode)) return null;
  if (ctx.toolName !== 'bash' && ctx.toolName !== 'shell') return null;
  const cmd = commandOf(ctx);
  if (!cmd) return null;

  const askPatterns: Array<{ re: RegExp; reason: string }> = [
    { re: /\bgit\s+push\b/i, reason: 'git push requires approval' },
    { re: /\bnpm\s+publish\b/i, reason: 'npm publish requires approval' },
    { re: /\bpnpm\s+publish\b/i, reason: 'pnpm publish requires approval' },
    { re: /\bdocker\s+push\b/i, reason: 'docker push requires approval' },
  ];

  for (const { re, reason } of askPatterns) {
    if (re.test(cmd)) {
      return { decision: 'ask' as PolicyDecision, reason };
    }
  }
  return null;
};

/** 判定顺序：deny → mode 白名单 → preset → ask → 默认 allow */
const defaultRules: PolicyRule[] = [
  subagentDepthDenyRule,
  bashEgressDenyRule,
  dangerousBashDenyRule,
  debugBashClearLogDenyRule,
  debugReproGateRule,
  debugKeepProbesRule,
  debugDeleteFileRule,
  readonlyModeWriteDenyRule,
  readonlyModeBashRule,
  askTaskExploreOnlyRule,
  planTaskNoBrowserRule,
  mcpToolRule,
  extToolRule,
  modeWhitelistRule,
  presetWhitelistRule,
  sensitiveAskRule,
];

export class PolicyEngine {
  constructor(private readonly rules: PolicyRule[] = defaultRules) {}

  evaluate(ctx: PolicyContext): PolicyResult {
    for (const rule of this.rules) {
      const result = rule(ctx);
      if (result) return result;
    }
    return { decision: 'allow' };
  }

  isAllowed(ctx: PolicyContext): boolean {
    return this.evaluate(ctx).decision === 'allow';
  }
}
