import { randomUUID } from 'node:crypto';
import type { PlanQuestionAnswer, PlanQuestionItem } from '@ciro-code/harness-shared';

export function normalizePlanQuestions(questions: PlanQuestionItem[]): PlanQuestionItem[] {
  return questions.map((q, i) => ({
    id: String(q.id || `q${i + 1}`),
    prompt: String(q.prompt ?? ''),
    ...(q.allowMultiple ? { allowMultiple: true as const } : {}),
    options: Array.isArray(q.options)
      ? q.options.map((o, j) => ({
          id: String(o.id || `o${j + 1}`),
          label: String(o.label ?? ''),
        }))
      : undefined,
  }));
}

export type PlanQuestionDecision =
  | { skipped: true }
  | { skipped?: false; answers: PlanQuestionAnswer[] };

export interface PlanQuestionRequest {
  id: string;
  sessionId: string;
  questions: PlanQuestionItem[];
}

interface Pending {
  request: PlanQuestionRequest;
  resolve: (decision: PlanQuestionDecision) => void;
}

/**
 * Plan AskQuestion 同步门闩：推送 SSE 后挂起，直至 UI Continue / Skip 或会话中止。
 * 形态对齐 ModeSuggestBroker。同 session 已有 pending 时拒绝新请求。无自动超时。
 */
export class PlanQuestionBroker {
  private readonly pending = new Map<string, Pending>();
  private onRequest: ((req: PlanQuestionRequest) => void) | null = null;

  setRequestHandler(handler: ((req: PlanQuestionRequest) => void) | null): void {
    this.onRequest = handler;
  }

  hasPendingForSession(sessionId: string): boolean {
    for (const item of this.pending.values()) {
      if (item.request.sessionId === sessionId) return true;
    }
    return false;
  }

  async requestAnswers(
    req: Omit<PlanQuestionRequest, 'id'>,
  ): Promise<{ id: string; decision: PlanQuestionDecision }> {
    if (this.hasPendingForSession(req.sessionId)) {
      throw new Error('PLAN_QUESTION_BUSY: A question prompt is already pending for this session');
    }

    const id = randomUUID();
    const full: PlanQuestionRequest = { ...req, id };

    return new Promise<{ id: string; decision: PlanQuestionDecision }>((resolve) => {
      this.pending.set(id, {
        request: full,
        resolve: (decision) => resolve({ id, decision }),
      });
      this.onRequest?.(full);
    });
  }

  resolve(id: string, decision: PlanQuestionDecision): boolean {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id);
    item.resolve(decision);
    return true;
  }

  getPending(id: string): PlanQuestionRequest | undefined {
    return this.pending.get(id)?.request;
  }

  /** 中止会话时全部视为 skip */
  rejectAll(sessionId?: string): void {
    for (const [id, item] of this.pending) {
      if (sessionId && item.request.sessionId !== sessionId) continue;
      this.pending.delete(id);
      item.resolve({ skipped: true });
    }
  }
}
