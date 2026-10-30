import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import {
  BROWSER_MCP_NOT_READY_MESSAGE,
  BROWSER_MCP_SERVER_ID,
  filterBrowserMcpTools,
  getSubagentKind,
  isBrowserMcpReady,
  isSummarySchemaV1,
  SUBMIT_EXPLORE_SUMMARY_TOOL,
  type ModelRef,
  type SubagentSystemKey,
  type SummarySchemaV1,
} from '@ciro-code/harness-shared';
import {
  createSessionPolicyGate,
  type AuditLog,
  type ExploreRunner,
  type ExploreRunInput,
  type McpManager,
  type PermissionBroker,
  type PolicyEngine,
  type ProviderStore,
  type ShellAllowlistStore,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';
import { defineTool, type ModelRuntime, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { createSandboxedBashTool } from '../tools/bash-tool.js';
import { createSandboxedGrepTool } from '../tools/grep-tool.js';
import { createSandboxedListFilesTool } from '../tools/list-files-tool.js';
import { createSandboxedReadTool } from '../tools/read-tool.js';
import { buildMcpTools } from '../tools/mcp-tools.js';
import { toolResultIsError } from '../runtime/tool-error.js';
import {
  createSessionPromptRefs,
  openPiAgentSession,
} from '../runtime/pi-session-factory.js';
import { resolvePiModel } from '../runtime/resolve-pi-model.js';

/** snapshot / 大结果进模型与 UI 的上限（字符） */
const BROWSER_RESULT_CLIP = 2_500;

export const EXPLORE_SYSTEM = `You are a short-lived Explore subagent. Use only read/list_files/grep/bash (readonly) and SubmitExploreSummary. Do not modify files. Do not call Task.

Investigate the user brief with read-only tools, then ALWAYS finish by calling the SubmitExploreSummary tool with summary_schema_v1 fields.

SubmitExploreSummary parameters:
- conclusion: non-empty string answering the brief
- paths: workspace-relative files/dirs you inspected or found (may be [])
- symbols: class/function/module names discovered (may be [])
- openQuestions: remaining unknowns (may be [])
- confidence: "high" | "medium" | "low"

Rules:
- Do NOT output summary JSON (or any schema payload) as assistant text.
- Do NOT use bash/echo/printf to print the summary — call SubmitExploreSummary only.
- Intermediate natural-language progress is fine; the run only succeeds after SubmitExploreSummary.`;

export const VERIFY_SYSTEM = `You are a short-lived Verify subagent. Use only read/list_files/grep/bash and SubmitExploreSummary. Do not modify files (no write/edit). Do not call Task or WebFetch.

Run tests or inspect the workspace to check the parent brief, then ALWAYS finish by calling SubmitExploreSummary with summary_schema_v1 fields.

SubmitExploreSummary parameters:
- conclusion: non-empty string answering whether the claim holds
- paths: workspace-relative files/dirs you inspected (may be [])
- symbols: class/function/module names (may be [])
- openQuestions: remaining unknowns (may be [])
- confidence: "high" | "medium" | "low"

Rules:
- Do NOT output summary JSON as assistant text.
- Do NOT use bash/echo/printf to print the summary — call SubmitExploreSummary only.
- Bash may run tests (e.g. pnpm test). Do not curl/wget.`;

export const SHELL_SYSTEM = `You are a short-lived Shell subagent. Use read/list_files/grep/bash and SubmitExploreSummary. Do not use write/edit tools. Do not call Task or WebFetch.

Run shell commands to fulfill the parent brief (install scripts, build, diagnostics, etc.), then ALWAYS finish by calling SubmitExploreSummary with summary_schema_v1 fields.

SubmitExploreSummary parameters:
- conclusion: non-empty string summarizing command outcomes
- paths: workspace-relative files/dirs you inspected (may be [])
- symbols: class/function/module names (may be [])
- openQuestions: remaining unknowns (may be [])
- confidence: "high" | "medium" | "low"

Rules:
- Do NOT output summary JSON as assistant text.
- Do NOT use bash/echo/printf to print the summary — call SubmitExploreSummary only.
- Do not curl/wget (use WebFetch only from the parent). Dangerous commands may require approval.`;

export const BROWSER_SYSTEM = `You are a short-lived Browser subagent. Use only Playwright MCP browser_* tools and SubmitExploreSummary. Do not use write/edit/bash/Task/WebFetch.

Navigate and interact with pages to fulfill the parent brief, then ALWAYS finish by calling SubmitExploreSummary with summary_schema_v1 fields.

SubmitExploreSummary parameters:
- conclusion: non-empty string answering the brief (what you saw / did)
- paths: relevant URLs you visited (may be [])
- symbols: key UI labels / selectors / titles (may be [])
- openQuestions: remaining unknowns (may be [])
- confidence: "high" | "medium" | "low"

Rules:
- Prefer browser_snapshot over huge screenshots in reasoning.
- Do NOT paste full snapshots into assistant text; summarize.
- Do NOT output summary JSON as assistant text — call SubmitExploreSummary only.
- Do not call Task or leave the browser tools set.`;

export const SUBMIT_REMINDER = `Stop using read/list/grep/bash. Based on what you already found, call SubmitExploreSummary now with conclusion, paths, symbols, openQuestions, and confidence. Do NOT output JSON as assistant text. Do NOT echo/printf the summary via bash.`;

export const BROWSER_SUBMIT_REMINDER = `Stop using browser tools. Based on what you already saw, call SubmitExploreSummary now with conclusion, paths (URLs), symbols, openQuestions, and confidence. Do NOT paste full snapshots as assistant text.`;

const SYSTEM_BY_KEY: Record<SubagentSystemKey, string> = {
  explore: EXPLORE_SYSTEM,
  verify: VERIFY_SYSTEM,
  shell: SHELL_SYSTEM,
  browser: BROWSER_SYSTEM,
};

type SummaryHolder = { summary: SummarySchemaV1 | null };

function failTool(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { error: true },
  };
}

/** 缺省空数组、confidence 大小写；在入 holder 前归一化 */
export function normalizeSummaryParams(raw: unknown): SummarySchemaV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const asStringArray = (value: unknown): string[] | null => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) return null;
    return value;
  };
  const paths = asStringArray(v.paths);
  if (paths === null) return null;
  const symbols = asStringArray(v.symbols);
  if (symbols === null) return null;
  const openQuestions = asStringArray(v.openQuestions);
  if (openQuestions === null) return null;
  if (typeof v.conclusion !== 'string' || typeof v.confidence !== 'string') return null;
  const candidate = {
    conclusion: v.conclusion.trim(),
    paths,
    symbols,
    openQuestions,
    confidence: v.confidence.trim().toLowerCase(),
  };
  return isSummarySchemaV1(candidate) ? candidate : null;
}

export interface SubmitExploreSummaryToolOptions {
  /** 合法摘要写入后回调（用于立刻 abort agent，避免继续绕圈再提交） */
  onAccepted?: () => void;
}

/** Explore 协议工具：合法 args 写入 holder；不经 Policy gate（仅注册于 explore session） */
export function createSubmitExploreSummaryTool(
  holder: SummaryHolder,
  opts?: SubmitExploreSummaryToolOptions,
) {
  return defineTool({
    name: SUBMIT_EXPLORE_SUMMARY_TOOL,
    label: 'Submit Explore Summary',
    description:
      'Submit the final explore summary_schema_v1. Call once when investigation is done. Do not put the summary in assistant text.',
    parameters: Type.Object({
      conclusion: Type.String({ description: 'Non-empty answer to the explore brief' }),
      paths: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Workspace-relative paths inspected or found (default [])',
        }),
      ),
      symbols: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Symbols / type / function names discovered (default [])',
        }),
      ),
      openQuestions: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Remaining unknowns (default [])',
        }),
      ),
      confidence: Type.String({ description: 'high | medium | low' }),
    }),
    execute: async (_toolCallId, params) => {
      const normalized = normalizeSummaryParams(params);
      if (!normalized) {
        return failTool(
          'Invalid summary_schema_v1: need non-empty conclusion, paths/symbols/openQuestions string arrays, and confidence high|medium|low.',
        );
      }
      holder.summary = normalized;
      // 工具返回后再 abort，避免在 execute 栈内打断当前 tool_execution
      queueMicrotask(() => {
        try {
          opts?.onAccepted?.();
        } catch {
          // ignore
        }
      });
      return {
        content: [{ type: 'text' as const, text: 'Summary submitted. End this turn; do not call more tools.' }],
        details: { error: false },
      };
    },
  });
}

function progressForTool(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
  bashLabel: string,
): string {
  const path = typeof toolInput?.path === 'string' ? toolInput.path : undefined;
  const pattern = typeof toolInput?.pattern === 'string' ? toolInput.pattern : undefined;
  const url = typeof toolInput?.url === 'string' ? toolInput.url : undefined;
  if (toolName === 'read' && path) return `Reading ${path}`;
  if (toolName === 'grep' && pattern) return `Grepping ${pattern.slice(0, 48)}`;
  if (toolName === 'list_files') return path ? `Listing ${path}` : 'Listing files';
  if (toolName === 'bash') return bashLabel;
  if (toolName.includes('browser_navigate') && url) {
    return `Navigating ${url.slice(0, 64)}`;
  }
  if (toolName.includes('browser_snapshot')) return 'Capturing page snapshot…';
  if (toolName.includes('browser_click')) return 'Clicking…';
  if (toolName.startsWith('mcp:') && toolName.includes('browser_')) {
    return `Browser: ${toolName.split(':').pop() ?? toolName}`;
  }
  return `Using ${toolName}`;
}

function clipToolResultText(text: string, max = BROWSER_RESULT_CLIP): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

/** 强折叠 snapshot 等大结果后再交给模型 */
function wrapBrowserMcpTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool) => {
    const short = tool.name.split(':').pop() ?? tool.name;
    const needsClip =
      short.includes('snapshot') ||
      short.includes('screenshot') ||
      short.includes('console') ||
      short.includes('network');
    if (!needsClip) return tool;
    const inner = tool.execute.bind(tool);
    return {
      ...tool,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const result = await inner(toolCallId, params, signal, onUpdate, ctx);
        if (!result?.content || !Array.isArray(result.content)) return result;
        return {
          ...result,
          content: result.content.map((part) => {
            if (part?.type === 'text' && typeof part.text === 'string') {
              return { ...part, text: clipToolResultText(part.text) };
            }
            return part;
          }),
        };
      },
    };
  });
}

export interface LlmExploreRunnerDeps {
  policy: PolicyEngine;
  audit: AuditLog;
  permissions: PermissionBroker;
  shellAllowlist?: ShellAllowlistStore;
  providerStore?: ProviderStore;
  /** browser kind：注入 Playwright MCP 工具 */
  mcpManager?: McpManager;
  /** 父会话本轮启用的 MCP server id */
  getParentMcpEnabled?: (parentSessionId: string) => string[];
  getModelRuntime: () => Promise<ModelRuntime>;
  /** inherit: session modelRef; fast: null → resolvePiModel default */
  getParentModelRef?: (parentSessionId: string) => ModelRef | null | undefined;
  /**
   * 每次 explore run 读取（设置页改完后下次 send 生效）。
   * 优先 getExploreModel；否则用静态 exploreModel。
   */
  getExploreModel?: () => 'fast' | 'inherit';
  exploreModel?: 'fast' | 'inherit';
}

function looksLikeImageOnlyModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    /(^|[/_-])image([/_-]|$)/.test(id) ||
    id.includes('image-') ||
    id.includes('-image') ||
    id.includes('imagen') ||
    id.includes('dall-e') ||
    id.includes('flux')
  );
}

function lastAssistantError(messages: readonly unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; errorMessage?: string } | undefined;
    if (m?.role === 'assistant' && m.errorMessage) return m.errorMessage;
  }
  return undefined;
}

export function createLlmExploreRunner(deps: LlmExploreRunnerDeps): ExploreRunner {
  return async (input: ExploreRunInput): Promise<SummarySchemaV1> => {
    const { workspace, prompt, signal, onProgress, onEvent, parentSessionId } = input;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const modelRuntime = await deps.getModelRuntime();
    const parentRef = deps.getParentModelRef?.(parentSessionId) ?? null;

    const exploreModel =
      deps.getExploreModel?.() ?? deps.exploreModel ?? 'inherit';
    let preferred: ModelRef | null =
      exploreModel === 'inherit' ? parentRef : null;
    let resolved = deps.providerStore
      ? await resolvePiModel(modelRuntime, deps.providerStore, preferred)
      : null;

    // 默认/fast 常落到 providers.defaultModelRef；若是 image-only 则改用父会话文本模型
    if (
      resolved &&
      looksLikeImageOnlyModel(resolved.modelRef.modelId) &&
      parentRef &&
      !looksLikeImageOnlyModel(parentRef.modelId) &&
      deps.providerStore
    ) {
      preferred = parentRef;
      resolved = await resolvePiModel(modelRuntime, deps.providerStore, preferred);
    }

    if (resolved && looksLikeImageOnlyModel(resolved.modelRef.modelId)) {
      throw new Error(
        `Explore cannot use image-only model "${resolved.modelRef.modelId}". Select a text chat model in the parent session.`,
      );
    }

    if (!resolved) {
      throw new Error('No model available for explore (configure providers / API key)');
    }

    const kindType = input.subagentType ?? 'explore';
    const kind = getSubagentKind(kindType);
    const system = SYSTEM_BY_KEY[kind.systemKey];
    const bashLabel =
      kind.policyMode === 'ask' ? 'Running readonly shell' : 'Running shell';
    const gate: ToolPolicyGate = createSessionPolicyGate({
      policy: deps.policy,
      audit: deps.audit,
      permissions: deps.permissions,
      shellAllowlist: deps.shellAllowlist,
      getMcpReadOnlyHint: (n) => deps.mcpManager?.getReadOnlyHint(n),
      getCtx: () => ({
        mode: kind.policyMode,
        preset: kind.permissionPreset,
        workspace,
        sessionId: `${kindType}:${input.taskId}`,
        subagentDepth: 1,
      }),
    });

    const holder: SummaryHolder = { summary: null };
    /** 合法 Submit 后主动停 agent；与用户 abort 区分，不置 signal */
    let stopAfterSummary: (() => void) | null = null;

    let customTools: ToolDefinition[];
    let activeToolNames: string[];

    if (kindType === 'browser') {
      const mcp = deps.mcpManager;
      if (!mcp) throw new Error(BROWSER_MCP_NOT_READY_MESSAGE);
      const enabled = deps.getParentMcpEnabled?.(parentSessionId) ?? [
        BROWSER_MCP_SERVER_ID,
      ];
      await mcp.ensureConnected(enabled);
      const connected = mcp.getConnectedTools(enabled);
      if (!isBrowserMcpReady({ enabledServerIds: enabled, connectedTools: connected })) {
        throw new Error(BROWSER_MCP_NOT_READY_MESSAGE);
      }
      const browserTools = filterBrowserMcpTools(connected);
      const serverIds = [...new Set(browserTools.map((t) => t.serverId))];
      const mcpDefs = wrapBrowserMcpTools(buildMcpTools(mcp, serverIds, gate)).filter((t) =>
        browserTools.some((b) => b.fullName === t.name),
      );
      if (mcpDefs.length === 0) throw new Error(BROWSER_MCP_NOT_READY_MESSAGE);
      customTools = [
        ...mcpDefs,
        createSubmitExploreSummaryTool(holder, {
          onAccepted: () => {
            onProgress('Summary submitted');
            stopAfterSummary?.();
          },
        }),
      ];
      activeToolNames = customTools.map((t) => t.name);
    } else {
      customTools = [
        createSandboxedReadTool(workspace, gate, {
          getSupportsVision: () =>
            Array.isArray(resolved.model.input) &&
            resolved.model.input.includes('image'),
        }),
        createSandboxedListFilesTool(workspace, gate),
        createSandboxedGrepTool(workspace, gate),
        createSandboxedBashTool(workspace, gate),
        createSubmitExploreSummaryTool(holder, {
          onAccepted: () => {
            onProgress('Summary submitted');
            stopAfterSummary?.();
          },
        }),
      ];
      activeToolNames = [...kind.tools];
    }

    const refs = createSessionPromptRefs(system);
    const opened = await openPiAgentSession({
      workspace,
      modePrompt: system,
      refs,
      customTools,
      activeToolNames,
      modelRuntime,
      model: resolved.model,
    });

    stopAfterSummary = () => {
      try {
        void opened.session.agent.abort();
      } catch {
        // ignore
      }
    };

    const seenPaths: string[] = [];

    const unsub = opened.session.subscribe((event) => {
      switch (event.type) {
        case 'message_update':
          if (event.assistantMessageEvent.type === 'text_delta') {
            onEvent({ type: 'token', delta: event.assistantMessageEvent.delta });
          } else if (event.assistantMessageEvent.type === 'thinking_delta') {
            onEvent({ type: 'thinking', delta: event.assistantMessageEvent.delta });
          }
          break;
        case 'tool_execution_start': {
          const toolName = event.toolName;
          // 协议工具：不推到子 Tab（避免 args JSON 闪现）
          if (toolName === SUBMIT_EXPLORE_SUMMARY_TOOL) break;
          const toolCallId = event.toolCallId ?? randomUUID();
          const toolInput = event.args as Record<string, unknown> | undefined;
          const p = typeof toolInput?.path === 'string' ? toolInput.path : undefined;
          if (p && !seenPaths.includes(p)) seenPaths.push(p);
          onEvent({
            type: 'tool_call_start',
            toolCallId,
            toolName,
            toolInput,
          });
          onProgress(progressForTool(toolName, toolInput, bashLabel));
          break;
        }
        case 'tool_execution_end': {
          if (event.toolName === SUBMIT_EXPLORE_SUMMARY_TOOL) {
            if (!holder.summary && toolResultIsError(event)) {
              onProgress('SubmitExploreSummary rejected; retry with valid fields');
            }
            break;
          }
          const toolCallId = event.toolCallId ?? randomUUID();
          const preview =
            typeof event.result === 'string'
              ? event.result
              : JSON.stringify(event.result) ?? '';
          const isError = toolResultIsError(event);
          const previewCap =
            kindType === 'browser' || String(event.toolName).includes('browser_snapshot')
              ? 280
              : 400;
          onEvent({
            type: 'tool_call_result',
            toolCallId,
            toolName: event.toolName,
            resultPreview: preview.slice(0, previewCap),
            isError,
          });
          break;
        }
        default:
          break;
      }
    });

    const onAbort = () => {
      try {
        void opened.session.agent.abort();
      } catch {
        // ignore
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const runUntilIdle = async (text: string) => {
      try {
        await opened.session.prompt(text);
        await opened.session.agent.waitForIdle();
      } catch (err) {
        // 合法摘要后主动 abort 可能让 prompt 以取消结束
        if (holder.summary) return;
        throw err;
      }
    };

    try {
      onProgress(kindType === 'browser' ? 'Starting browser…' : 'Starting explore…');
      await runUntilIdle(prompt);
      if (signal.aborted && !holder.summary) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (!holder.summary) {
        onProgress('Requesting SubmitExploreSummary…');
        const hint =
          seenPaths.length > 0
            ? `\nPaths seen in tools: ${seenPaths.slice(0, 12).join(', ')}`
            : '';
        const reminder =
          kindType === 'browser' ? BROWSER_SUBMIT_REMINDER : SUBMIT_REMINDER;
        await runUntilIdle(`${reminder}${hint}`);
        if (signal.aborted && !holder.summary) {
          throw new DOMException('Aborted', 'AbortError');
        }
      }

      if (!holder.summary) {
        const apiErr = lastAssistantError(opened.session.messages);
        throw new Error(
          apiErr
            ? `${kindType === 'browser' ? 'Browser' : 'Explore'} model error: ${apiErr}`
            : `${kindType === 'browser' ? 'Browser' : 'Explore'} did not call SubmitExploreSummary with valid summary_schema_v1`,
        );
      }
      return holder.summary;
    } finally {
      signal.removeEventListener('abort', onAbort);
      unsub();
      try {
        opened.session.dispose();
      } catch {
        // ignore
      }
    }
  };
}
