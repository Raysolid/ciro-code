import { join } from 'node:path';
import type { ChatImageContent } from '@ciro-code/harness-shared';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionFactory,
  type ModelRuntime,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { PiResolvedModel } from './resolve-pi-model.js';
import { injectDebugReminder } from './debug-reminder.js';

/** Pi SDK agentDir；与 harness-core `piAgentDir` 同源约定 */
export function piAgentDir(workspace: string): string {
  return join(workspace, '.ciro', 'pi-agent');
}

export interface SeedChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImageContent[];
}

export const EPHEMERAL_CONTEXT_CUSTOM_TYPE = 'ciro.ephemeral_context';

export interface SessionPromptRefs {
  /**
   * Stable system 核（base + always-rules + memory）。
   * ResourceLoader systemPromptOverride 读取；跨 mode 尽量不变。
   */
  modePrompt: { current: string };
  /**
   * 本轮 ephemeral（mode delta + glob-rules + skills + plan）。
   * before_agent_start 以 custom→user 注入，不进 system。
   */
  ephemeralExtras: { current: string };
  /** @deprecated 使用 ephemeralExtras；保留别名避免外部误用 */
  turnExtras: { current: string };
  /** Debug 会话信息；在 ephemeral 上做占位符替换 */
  debugInfo: {
    current: null | {
      debugSessionId: string;
      ingestUrl: string;
      logPathRel: string;
      failed?: boolean;
      analyzeUnlocked?: boolean;
      cleanupUnlocked?: boolean;
    };
  };
}

/** 会话内热补 MCP 工具：由 extension factory 写入 registerTool */
export type ToolRegisterHolder = {
  registerTool: ((tool: ToolDefinition) => void) | null;
};

export function createToolRegisterHolder(): ToolRegisterHolder {
  return { registerTool: null };
}

type AppendableMessage = Parameters<SessionManager['appendMessage']>[0];

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function createSessionPromptRefs(modePrompt: string): SessionPromptRefs {
  const ephemeral = { current: '' };
  return {
    modePrompt: { current: modePrompt },
    ephemeralExtras: ephemeral,
    turnExtras: ephemeral,
    debugInfo: { current: null },
  };
}

/** 组装 ephemeral 正文（含可选 debug 占位替换） */
export function buildEphemeralContextText(
  extras: string,
  debugInfo: SessionPromptRefs['debugInfo']['current'],
): string {
  const body = extras.trim();
  if (debugInfo) {
    return injectDebugReminder(body, debugInfo).trim();
  }
  return body;
}

function ephemeralContextExtension(refs: SessionPromptRefs): ExtensionFactory {
  return (pi) => {
    pi.on('before_agent_start', () => {
      const text = buildEphemeralContextText(
        refs.ephemeralExtras.current,
        refs.debugInfo.current,
      );
      if (!text) return undefined;
      return {
        message: {
          customType: EPHEMERAL_CONTEXT_CUSTOM_TYPE,
          content: [
            {
              type: 'text',
              text: `<ephemeral_context>\n${text}\n</ephemeral_context>`,
            },
          ],
          display: false,
        },
      };
    });
  };
}

function toolRegisterExtension(holder: ToolRegisterHolder): ExtensionFactory {
  return (pi) => {
    holder.registerTool = (tool) => {
      pi.registerTool(tool);
    };
  };
}

function toPiMessage(msg: SeedChatMessage, ts: number): AppendableMessage {
  if (msg.role === 'user') {
    const images = msg.images ?? [];
    if (images.length === 0) {
      return { role: 'user', content: msg.content, timestamp: ts } as AppendableMessage;
    }
    const parts: Array<{ type: 'text'; text: string } | ChatImageContent> = [];
    if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }
    parts.push(...images);
    return { role: 'user', content: parts, timestamp: ts } as AppendableMessage;
  }
  return {
    role: 'assistant',
    content: [{ type: 'text', text: msg.content }],
    api: 'openai-completions',
    provider: 'ciro-seed',
    model: 'history',
    usage: EMPTY_USAGE,
    stopReason: 'stop',
    timestamp: ts,
  } as AppendableMessage;
}

/** 文本级历史种子（不回放 tool 轮次） */
export function seedSessionManager(
  workspace: string,
  history: SeedChatMessage[],
): ReturnType<typeof SessionManager.inMemory> {
  const sm = SessionManager.inMemory(workspace);
  const base = Date.now() - history.length * 1000;
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]!;
    if (!msg.content && !(msg.images && msg.images.length > 0)) continue;
    sm.appendMessage(toPiMessage(msg, base + i * 1000));
  }
  return sm;
}

export interface OpenPiSessionFactoryOptions {
  workspace: string;
  modePrompt: string;
  refs: SessionPromptRefs;
  customTools: ToolDefinition[];
  activeToolNames: string[];
  modelRuntime: ModelRuntime;
  model?: PiResolvedModel;
  history?: SeedChatMessage[];
  /** 热补 MCP 用；缺省则内部新建（调用方应传入并挂到 session entry） */
  toolRegister?: ToolRegisterHolder;
}

export async function openPiAgentSession(
  opts: OpenPiSessionFactoryOptions,
): Promise<{
  session: AgentSession;
  refs: SessionPromptRefs;
  toolRegister: ToolRegisterHolder;
}> {
  const { refs } = opts;
  refs.modePrompt.current = opts.modePrompt;
  const toolRegister = opts.toolRegister ?? createToolRegisterHolder();

  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd: opts.workspace,
    agentDir: piAgentDir(opts.workspace),
    settingsManager,
    noSkills: true,
    systemPromptOverride: () => refs.modePrompt.current,
    appendSystemPromptOverride: () => [],
    extensionFactories: [ephemeralContextExtension(refs), toolRegisterExtension(toolRegister)],
  });
  await loader.reload();

  const sessionManager =
    opts.history && opts.history.length > 0
      ? seedSessionManager(opts.workspace, opts.history)
      : SessionManager.inMemory(opts.workspace);

  const { session } = await createAgentSession({
    cwd: opts.workspace,
    // 不传 tools：Pi 会把 tools 当成永久 registry cap，Plan 开局后 setActiveToolsByName('write') 会被静默丢掉
    noTools: 'builtin',
    customTools: opts.customTools,
    sessionManager,
    settingsManager,
    resourceLoader: loader,
    modelRuntime: opts.modelRuntime,
    ...(opts.model ? { model: opts.model } : {}),
  });
  session.setActiveToolsByName(opts.activeToolNames);

  return { session, refs, toolRegister };
}
