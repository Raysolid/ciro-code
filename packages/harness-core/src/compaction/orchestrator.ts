import type {
  CompactionConfig,
  CompactionMethod,
  CompactionResult,
  ContextUrgency,
  HarnessMode,
} from '@ciro/harness-shared';
import type { ContextAccountant } from '../context/context-accountant.js';
import { runMicroCompact, type ToolResultRecord } from './micro-compact.js';
import { ToolResultStore } from './tool-result-store.js';
import {
  appendSessionNote,
  runSessionMemoryCompact,
} from './session-memory.js';
import { runFullCompact } from './full-compact.js';

export interface CompactRequest {
  sessionId: string;
  workspace: string;
  mode: HarnessMode;
  method?: CompactionMethod;
  conversationText: string;
  summarizedText?: string;
  toolResults: ToolResultRecord[];
  sessionDir: string;
}

export interface CompactOutcome {
  result: CompactionResult;
  conversationText: string;
  summarizedText: string;
  toolResults: ToolResultRecord[];
  suggested?: boolean;
}

/**
 * 分层 compact 编排：micro → session-memory → full
 * urgency 只读 ContextAccountant；尊重 compaction.mode 与熔断。
 */
export class CompactionOrchestrator {
  private consecutiveFailures = new Map<string, number>();

  constructor(
    private readonly config: CompactionConfig,
    private readonly context: ContextAccountant,
  ) {}

  /** 根据当前 snapshot 决定是否自动跑 / 仅建议 */
  decideAutoAction(sessionId: string): {
    urgency: ContextUrgency;
    action: 'none' | 'micro' | 'session-memory' | 'full' | 'suggest';
  } {
    const urgency = this.context.getCompactUrgency(sessionId);
    if (urgency === 'none') return { urgency, action: 'none' };

    if (this.isFused(sessionId)) {
      return { urgency, action: 'none' };
    }

    if (this.config.mode === 'manual') {
      return { urgency, action: 'suggest' };
    }

    if (this.config.mode === 'ask') {
      if (urgency === 'background') return { urgency, action: 'micro' };
      return { urgency, action: 'suggest' };
    }

    // auto
    if (urgency === 'background') return { urgency, action: 'micro' };
    if (urgency === 'suggest') return { urgency, action: 'session-memory' };
    return { urgency, action: 'full' };
  }

  async compact(req: CompactRequest): Promise<CompactOutcome> {
    const method = this.resolveMethod(req);

    try {
      const outcome = this.runMethod(method, req);
      this.consecutiveFailures.set(req.sessionId, 0);
      return outcome;
    } catch (err) {
      const n = (this.consecutiveFailures.get(req.sessionId) ?? 0) + 1;
      this.consecutiveFailures.set(req.sessionId, n);
      throw err;
    }
  }

  /** 每轮结束后追加 session 笔记（不阻断） */
  noteTurn(
    workspace: string,
    turn: { userMessage: string; assistantPreview?: string; toolNames?: string[] },
  ): void {
    appendSessionNote(workspace, {
      role: 'user',
      summary: turn.userMessage.slice(0, 200),
    });
    if (turn.toolNames?.length) {
      appendSessionNote(workspace, {
        role: 'tool',
        summary: `tools: ${turn.toolNames.join(', ')}`,
      });
    }
    if (turn.assistantPreview) {
      appendSessionNote(workspace, {
        role: 'assistant',
        summary: turn.assistantPreview.slice(0, 200),
      });
    }
  }

  private isFused(sessionId: string): boolean {
    const n = this.consecutiveFailures.get(sessionId) ?? 0;
    return n >= this.config.maxConsecutiveFailures;
  }

  private resolveMethod(req: CompactRequest): 'micro' | 'session-memory' | 'full' {
    if (req.method && req.method !== 'auto') {
      return req.method;
    }
    const { action } = this.decideAutoAction(req.sessionId);
    if (action === 'micro') return 'micro';
    if (action === 'session-memory') return 'session-memory';
    if (action === 'full') return 'full';
    return 'micro';
  }

  private runMethod(
    method: 'micro' | 'session-memory' | 'full',
    req: CompactRequest,
  ): CompactOutcome {
    if (method === 'micro') {
      const store = new ToolResultStore(req.sessionDir);
      const out = runMicroCompact({
        sessionId: req.sessionId,
        mode: req.mode,
        toolResults: req.toolResults,
        store,
      });
      return {
        result: out.result,
        conversationText: req.conversationText,
        summarizedText: req.summarizedText ?? '',
        toolResults: out.toolResults,
      };
    }

    if (method === 'full') {
      const full = runFullCompact({
        workspace: req.workspace,
        mode: req.mode,
        conversationText: req.conversationText,
        summarizedText: req.summarizedText,
      });
      return {
        result: full.result,
        conversationText: full.conversationText,
        summarizedText: full.summarizedText,
        toolResults: req.toolResults,
      };
    }

    const sm = runSessionMemoryCompact({
      workspace: req.workspace,
      mode: req.mode,
      conversationText: req.conversationText,
    });
    return {
      result: sm.result,
      conversationText: sm.conversationText,
      summarizedText: sm.summarizedText,
      toolResults: req.toolResults,
    };
  }
}
