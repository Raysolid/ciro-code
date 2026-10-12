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

export interface SessionPromptRefs {
  /** Mode 人设；ResourceLoader systemPromptOverride 读取 */
  modePrompt: { current: string };
  /** 本轮追加（memory/skill/plan）；before_agent_start 读取 */
  turnExtras: { current: string };
  /** Debug 会话信息；before_agent_start 内对已组装 prompt 做占位符替换 */
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
  return {
    modePrompt: { current: modePrompt },
    turnExtras: { current: '' },
    debugInfo: { current: null },
  };
}

function turnExtrasExtension(refs: SessionPromptRefs): ExtensionFactory {
  return (pi) => {
    pi.on('before_agent_start', (event) => {
      let system = event.systemPrompt;
      if (refs.debugInfo.current) {
        system = injectDebugReminder(system, refs.debugInfo.current);
      }
      const extras = refs.turnExtras.current.trim();
      if (extras) {
        system = `${system}\n\n${extras}`;
      }
      if (system === event.systemPrompt) return undefined;
      return { systemPrompt: system };
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
    extensionFactories: [turnExtrasExtension(refs), toolRegisterExtension(toolRegister)],
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
