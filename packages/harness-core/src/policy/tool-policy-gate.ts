import {
  defaultPresetForMode,
  type AuditEntry,
  type HarnessMode,
  type PermissionPreset,
  type PolicyContext,
  type PolicyResult,
} from '@ciro-code/harness-shared';
import type { PolicyEngine } from './policy-engine.js';
import type { AuditLog } from '../audit/audit-log.js';
import type { PermissionBroker } from '../permission/permission-broker.js';
import type { ShellAllowlistStore } from '../permission/shell-allowlist-store.js';
import { isMcpToolName } from '../mcp/mcp-manager.js';
import { isExtToolName } from '../extensions/extension-host.js';

export type ToolPolicyGateMeta = {
  toolCallId?: string;
};

export type ToolPolicyGate = (
  toolName: string,
  toolInput?: Record<string, unknown>,
  meta?: ToolPolicyGateMeta,
) => PolicyResult | Promise<PolicyResult>;

export interface PolicyGateOptions {
  policy: PolicyEngine;
  getCtx: () => {
    mode: HarnessMode;
    workspace: string;
    sessionId?: string;
    preset?: PermissionPreset;
    debugLogPath?: string;
    debugLogPathRel?: string;
    debugAnalyzeUnlocked?: boolean;
    debugCleanupUnlocked?: boolean;
    subagentDepth?: number;
  };
  /** 解析 mcp:* 工具的 readOnlyHint（来自已连接 MCP 工具表） */
  getMcpReadOnlyHint?: (toolName: string) => boolean | undefined;
  audit?: AuditLog;
  permissions?: PermissionBroker;
  /** Shell 命令白名单：ask 前命中则直接 allow */
  shellAllowlist?: ShellAllowlistStore;
}

function shellCommandFromInput(toolInput?: Record<string, unknown>): string | undefined {
  if (typeof toolInput?.command !== 'string') return undefined;
  const cmd = toolInput.command.trim();
  return cmd.length > 0 ? cmd : undefined;
}

function isGateOptions(v: PolicyEngine | PolicyGateOptions): v is PolicyGateOptions {
  return typeof v === 'object' && v !== null && 'policy' in v && 'getCtx' in v;
}

function targetSummary(_toolName: string, toolInput?: Record<string, unknown>): string | undefined {
  if (!toolInput) return undefined;
  if (typeof toolInput.path === 'string') return toolInput.path;
  if (typeof toolInput.command === 'string') return toolInput.command.slice(0, 120);
  return undefined;
}

export function createSessionPolicyGate(options: PolicyGateOptions): ToolPolicyGate;
/** @deprecated 使用对象参数形式 */
export function createSessionPolicyGate(
  policy: PolicyEngine,
  getCtx: () => { mode: HarnessMode; workspace: string },
): ToolPolicyGate;
export function createSessionPolicyGate(
  policyOrOpts: PolicyEngine | PolicyGateOptions,
  getCtx?: () => { mode: HarnessMode; workspace: string },
): ToolPolicyGate {
  const opts: PolicyGateOptions = isGateOptions(policyOrOpts)
    ? policyOrOpts
    : {
        policy: policyOrOpts,
        getCtx: getCtx!,
      };

  return async (toolName, toolInput, meta) => {
    const base = opts.getCtx();
    const sessionId = base.sessionId ?? 'unknown';
    const preset = base.preset ?? defaultPresetForMode(base.mode);
    const ctx: PolicyContext = {
      mode: base.mode,
      workspace: base.workspace,
      toolName,
      toolInput,
      preset,
      readOnlyHint: opts.getMcpReadOnlyHint?.(toolName),
      debugLogPath: base.debugLogPath,
      debugLogPathRel: base.debugLogPathRel,
      debugAnalyzeUnlocked: base.debugAnalyzeUnlocked,
      debugCleanupUnlocked: base.debugCleanupUnlocked,
      subagentDepth: base.subagentDepth,
    };

    let result = opts.policy.evaluate(ctx);
    let userOverride = false;

    if (result.decision === 'ask') {
      const command = shellCommandFromInput(toolInput);
      if (command && opts.shellAllowlist?.matches(command)) {
        result = {
          decision: 'allow',
          reason: 'Allowed by shell allowlist',
        };
      } else if (opts.permissions) {
        const decision = await opts.permissions.requestApproval({
          sessionId,
          mode: base.mode,
          toolName,
          toolInput,
          reason: result.reason,
          toolCallId: meta?.toolCallId,
        });
        userOverride = true;
        result = {
          decision,
          reason:
            decision === 'allow'
              ? result.reason ?? 'Approved by user'
              : result.reason ?? 'Denied by user',
        };
      } else {
        result = {
          decision: 'deny',
          reason: result.reason ?? 'Permission required but no handler',
        };
      }
    }

    const entry: Omit<AuditEntry, 'id'> = {
      timestamp: new Date().toISOString(),
      sessionId,
      mode: base.mode,
      tool: toolName,
      source: isExtToolName(toolName)
        ? 'extension'
        : isMcpToolName(toolName)
          ? 'mcp'
          : 'builtin',
      decision: result.decision,
      reason: result.reason ?? result.decision,
      targetSummary: targetSummary(toolName, toolInput),
      userOverride,
    };
    opts.audit?.append(entry);

    return result;
  };
}

export function isPolicyBlocked(result: PolicyResult): boolean {
  return result.decision !== 'allow';
}

export function policyBlockMessage(result: PolicyResult): string {
  if (result.decision === 'ask') {
    return result.reason ?? 'Permission required (approval pending)';
  }
  return result.reason ?? 'Tool denied by policy';
}
