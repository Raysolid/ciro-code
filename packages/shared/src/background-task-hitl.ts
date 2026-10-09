import type { SubagentStopReason, SubagentType, SummarySchemaV1 } from './types/subagent.js';

/** 同轮续跑时注入模型的文案前缀（不落盘为用户气泡） */
export const BACKGROUND_TASK_RESULT_MARKER = 'Background Task result:';

export interface BackgroundTaskResultPayload {
  taskId: string;
  subagent_type: SubagentType;
  status: 'completed' | 'failed' | 'stopped';
  summary?: SummarySchemaV1;
  error?: string;
  reason?: SubagentStopReason;
}

/** 同轮注入模型的固定文案（不落盘为用户气泡）；模型须据此继续汇总并给出完整答复 */
export function formatBackgroundTaskResultUserMessage(
  payload: BackgroundTaskResultPayload,
): string {
  return [
    BACKGROUND_TASK_RESULT_MARKER,
    '```json',
    JSON.stringify(payload),
    '```',
    'A background Task has finished. Continue the user request: combine this summary with your earlier findings in this conversation and give a complete answer now. Do not re-run the same Task. Do not stop without a substantive reply.',
  ].join('\n');
}

export function isBackgroundTaskResultUserMessage(text: string): boolean {
  return text.trimStart().startsWith(BACKGROUND_TASK_RESULT_MARKER);
}
