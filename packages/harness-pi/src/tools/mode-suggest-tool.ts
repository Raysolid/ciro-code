import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import {
  isPolicyBlocked,
  MODE_SUGGEST_TIMEOUT_MS,
  ModeSuggestBroker,
  policyBlockMessage,
  type ToolPolicyGate,
} from '@ciro-code/harness-core';
import type { HarnessMode } from '@ciro-code/harness-shared';

function fail(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { error: true },
  };
}

export interface SuggestModeToolContext {
  sessionId: string;
  broker: ModeSuggestBroker;
  getCurrentMode: () => HarnessMode;
  /** 用户确认切换后：写 session + 推 mode_changed */
  onSwitched?: (mode: HarnessMode, previousMode: HarnessMode) => void | Promise<void>;
  gate?: ToolPolicyGate;
}

/** 模型调用后向 UI 推送同步切换卡片，挂起直至用户操作 / 超时 skip */
export function createSuggestModeTool(ctx: SuggestModeToolContext) {
  return defineTool({
    name: 'SuggestMode',
    label: 'Suggest Mode',
    description:
      'Show a blocking mode-switch card in the chat UI. Call this when the user asks to change mode, or when Plan/Debug/Ask/Agent would clearly serve them better. Do not tell the user to switch manually in text — call this tool instead.',
    parameters: Type.Object({
      suggestedMode: Type.Union([
        Type.Literal('ask'),
        Type.Literal('agent'),
        Type.Literal('plan'),
        Type.Literal('debug'),
      ]),
      reason: Type.String({
        description: 'Short reason shown on the card (user-facing)',
      }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        if (ctx.gate) {
          const decision = await ctx.gate(
            'SuggestMode',
            params as unknown as Record<string, unknown>,
          );
          if (isPolicyBlocked(decision)) return fail(policyBlockMessage(decision));
        }

        const suggestedMode = params.suggestedMode as HarnessMode;
        const reason = String(params.reason ?? '').trim();
        const currentMode = ctx.getCurrentMode();

        if (suggestedMode === currentMode) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Already in ${suggestedMode} mode. Continue without switching.`,
              },
            ],
            details: { error: false, decision: 'noop' },
          };
        }

        const { decision } = await ctx.broker.requestApproval(
          {
            sessionId: ctx.sessionId,
            suggestedMode,
            currentMode,
            reason: reason || `Switch to ${suggestedMode}`,
          },
          MODE_SUGGEST_TIMEOUT_MS,
        );

        if (decision === 'switch') {
          await ctx.onSwitched?.(suggestedMode, currentMode);
          return {
            content: [
              {
                type: 'text' as const,
                text: `User switched to ${suggestedMode}. Continue in that mode; do not ask them to switch again.`,
              },
            ],
            details: { error: false, decision },
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `User skipped switching to ${suggestedMode}. Stay in ${currentMode} and continue without insisting on a mode change.`,
            },
          ],
          details: { error: false, decision },
        };
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });
}
