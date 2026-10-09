import type { HarnessMode } from './types/primitives.js';

const PLAN_BUILD_HEAD = 'Implement the confirmed plan';
const PLAN_BUILD_TAIL =
  'Follow it; do not wait for further confirmation. Update plan todos with TodoWrite as you go.';
const TITLED_HEAD = `${PLAN_BUILD_HEAD}: `;
const TITLED_TAIL = `. ${PLAN_BUILD_TAIL}`;

/** Confirm/Build 后 UI 注入的实现回合（对标 Debug Proceed）；无标题时的历史文案 */
export const PLAN_BUILD_USER_MESSAGE = `${PLAN_BUILD_HEAD}. ${PLAN_BUILD_TAIL}`;

function titledPlanTitle(text: string): string | undefined {
  const t = text.trim();
  if (!t.startsWith(TITLED_HEAD) || !t.endsWith(TITLED_TAIL)) return undefined;
  const title = t.slice(TITLED_HEAD.length, t.length - TITLED_TAIL.length).trim();
  return title || undefined;
}

/** 标题写入注入句，随 events.jsonl 落盘；resume 用 planTitleFromBuildMessage 读回 */
export function planBuildUserMessage(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  return t ? `${TITLED_HEAD}${t}${TITLED_TAIL}` : PLAN_BUILD_USER_MESSAGE;
}

export function isPlanBuildUserMessage(text: string): boolean {
  const t = text.trim();
  return t === PLAN_BUILD_USER_MESSAGE || titledPlanTitle(t) !== undefined;
}

export function planTitleFromBuildMessage(text: string): string | undefined {
  return titledPlanTitle(text);
}

/** send 回合实际 mode：Build 注入不得被客户端 stale `body.mode` 切回 plan */
export function resolveChatTurnMode(
  sessionMode: HarnessMode,
  requestedMode: HarnessMode | undefined,
  message: string,
): HarnessMode {
  if (isPlanBuildUserMessage(message)) return 'agent';
  return requestedMode ?? sessionMode;
}
