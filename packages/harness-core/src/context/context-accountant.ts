import {
  CONTEXT_BUCKET_LABELS,
  DEFAULT_COMPACTION_CONFIG,
  DEFAULT_MODEL_CONTEXT_LIMIT,
  DEFAULT_RESERVED_OUTPUT_TOKENS,
  type CompactionConfig,
  type ContextBucket,
  type ContextBucketId,
  type ContextUrgency,
  type ContextUsageSnapshot,
} from '@ciro-code/harness-shared';
import { roughTokenEstimate } from './token-estimate.js';

export interface ContextAccountantOptions {
  modelContextLimit?: number;
  reservedOutputTokens?: number;
  compaction?: CompactionConfig;
}

export interface ContextParts {
  system?: string;
  tools?: string;
  conversation?: string;
  memory?: string;
  rules?: string;
  skills?: string;
  mcp?: string;
  summarized?: string;
  /** Phase 4.3：Task 定义 + 返回的 summary_schema 文本 */
  subagents?: string;
}

/** 始终输出的桶（空桶 tokens=0） */
const PHASE_BUCKETS: ContextBucketId[] = [
  'system',
  'tools',
  'memory',
  'rules',
  'skills',
  'mcp',
  'subagents',
  'conversation',
  'summarized',
];

function urgencyFromRatio(
  ratio: number,
  thresholds: CompactionConfig['thresholds'],
): ContextUrgency {
  if (ratio >= thresholds.required) return 'required';
  if (ratio >= thresholds.suggest) return 'suggest';
  if (ratio >= thresholds.background) return 'background';
  return 'none';
}

export class ContextAccountant {
  private readonly snapshots = new Map<string, ContextUsageSnapshot>();
  private readonly conversationText = new Map<string, string>();
  private readonly summarizedText = new Map<string, string>();
  private readonly subagentsText = new Map<string, string>();
  /** 按 session 覆盖；无则用构造默认 */
  private readonly sessionLimits = new Map<string, number>();
  private readonly modelContextLimit: number;
  private readonly reservedOutputTokens: number;
  private readonly compaction: CompactionConfig;

  constructor(opts: ContextAccountantOptions = {}) {
    this.modelContextLimit = opts.modelContextLimit ?? DEFAULT_MODEL_CONTEXT_LIMIT;
    this.reservedOutputTokens = opts.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS;
    this.compaction = opts.compaction ?? structuredClone(DEFAULT_COMPACTION_CONFIG);
  }

  setSessionLimit(sessionId: string, limit: number): void {
    this.sessionLimits.set(sessionId, Math.max(1, Math.floor(limit)));
  }

  clearSessionLimit(sessionId: string): void {
    this.sessionLimits.delete(sessionId);
  }

  limitFor(sessionId: string): number {
    return this.sessionLimits.get(sessionId) ?? this.modelContextLimit;
  }

  appendConversation(sessionId: string, text: string): void {
    const prev = this.conversationText.get(sessionId) ?? '';
    this.conversationText.set(sessionId, prev + text);
  }

  setConversation(sessionId: string, text: string): void {
    this.conversationText.set(sessionId, text);
  }

  setSummarized(sessionId: string, text: string): void {
    this.summarizedText.set(sessionId, text);
  }

  appendSubagents(sessionId: string, text: string): void {
    const prev = this.subagentsText.get(sessionId) ?? '';
    this.subagentsText.set(sessionId, prev + text);
  }

  setSubagents(sessionId: string, text: string): void {
    this.subagentsText.set(sessionId, text);
  }

  getSubagents(sessionId: string): string {
    return this.subagentsText.get(sessionId) ?? '';
  }

  getConversation(sessionId: string): string {
    return this.conversationText.get(sessionId) ?? '';
  }

  getSummarized(sessionId: string): string {
    return this.summarizedText.get(sessionId) ?? '';
  }

  clear(sessionId: string): void {
    this.snapshots.delete(sessionId);
    this.conversationText.delete(sessionId);
    this.summarizedText.delete(sessionId);
    this.subagentsText.delete(sessionId);
    this.sessionLimits.delete(sessionId);
  }

  /**
   * 刷新快照。usageRatio 驱动 compact urgency。
   */
  refresh(sessionId: string, parts: ContextParts = {}): ContextUsageSnapshot {
    const conversation =
      parts.conversation ?? this.conversationText.get(sessionId) ?? '';
    const summarized =
      parts.summarized ?? this.summarizedText.get(sessionId) ?? '';
    const subagents =
      parts.subagents ?? this.subagentsText.get(sessionId) ?? '';

    const counts: Record<ContextBucketId, number> = {
      system: roughTokenEstimate(parts.system ?? ''),
      tools: roughTokenEstimate(parts.tools ?? ''),
      memory: roughTokenEstimate(parts.memory ?? ''),
      rules: roughTokenEstimate(parts.rules ?? ''),
      skills: roughTokenEstimate(parts.skills ?? ''),
      mcp: roughTokenEstimate(parts.mcp ?? ''),
      conversation: roughTokenEstimate(conversation),
      summarized: roughTokenEstimate(summarized),
      subagents: roughTokenEstimate(subagents),
    };

    const buckets: ContextBucket[] = PHASE_BUCKETS.map((id) => ({
      id,
      label: CONTEXT_BUCKET_LABELS[id],
      tokens: counts[id],
    }));

    const totalTokens = buckets.reduce((s, b) => s + b.tokens, 0);
    const modelContextLimit = this.limitFor(sessionId);
    const effectiveLimit = Math.max(1, modelContextLimit - this.reservedOutputTokens);
    const usageRatio = totalTokens / effectiveLimit;
    const snapshot: ContextUsageSnapshot = {
      sessionId,
      estimated: true,
      modelContextLimit,
      reservedOutputTokens: this.reservedOutputTokens,
      effectiveLimit,
      totalTokens,
      usageRatio,
      urgency: urgencyFromRatio(usageRatio, this.compaction.thresholds),
      buckets,
      updatedAt: new Date().toISOString(),
    };
    this.snapshots.set(sessionId, snapshot);
    return snapshot;
  }

  get(sessionId: string): ContextUsageSnapshot | undefined {
    return this.snapshots.get(sessionId);
  }

  /** compact urgency 唯一入口：读同一 snapshot.usageRatio */
  getCompactUrgency(sessionId: string): ContextUrgency {
    const snap = this.snapshots.get(sessionId);
    if (!snap) return 'none';
    return urgencyFromRatio(snap.usageRatio, this.compaction.thresholds);
  }
}
