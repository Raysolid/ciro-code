import type { DebugSessionInfo } from '@ciro-code/harness-shared';

const PLACEHOLDERS = {
  ingestUrl: /\{\{DEBUG_INGEST_URL\}\}/g,
  logPath: /\{\{DEBUG_LOG_PATH\}\}/g,
  sessionId: /\{\{DEBUG_SESSION_ID\}\}/g,
};

export type DebugReminderInfo = Pick<
  DebugSessionInfo,
  'debugSessionId' | 'ingestUrl' | 'logPathRel'
> & {
  failed?: boolean;
  analyzeUnlocked?: boolean;
  cleanupUnlocked?: boolean;
};

function thisTurnAppendix(info: DebugReminderInfo): string {
  const log = info.logPathRel || 'the session debug log';
  if (info.cleanupUnlocked) {
    return `\n\n## This turn (Debug)\n\nThe user marked the issue fixed. Confirm the log if needed, remove all probes, then give a 1–2 line summary. Do not emit <reproduction_steps>.`;
  }
  if (info.analyzeUnlocked) {
    return `\n\n## This turn (Debug)\n\nThe user reproduced. Read \`${log}\` and score each hypothesis with cited log lines. Keep probes. If they must reproduce again (including post-fix), delete_file that log only first. End this turn with a closed <reproduction_steps> block (required for the UI). Last item is Proceed unless post-fix log evidence already confirms the fix; only then last item is Mark as fixed (user's language).`;
  }
  return `\n\n## This turn (Debug)\n\nAdd probes now (do not change business logic). delete_file only \`${log}\`. Do not read the session log until Proceed. End this turn with a closed <reproduction_steps> block. Reading the source is not runtime evidence.`;
}

/** 将 debug prompt 中的 {{DEBUG_*}} 换成本次会话配置；prompt 里已经有 URL 时不再复读流程。 */
export function injectDebugReminder(systemPrompt: string, info: DebugReminderInfo): string {
  if (info.failed) {
    return `${systemPrompt}\n\n## Runtime logging\n\n**Ingest server failed to start. Stop immediately and tell the user — do not add instrumentation.**`;
  }
  let out = systemPrompt;
  out = out.replace(PLACEHOLDERS.ingestUrl, info.ingestUrl);
  out = out.replace(PLACEHOLDERS.logPath, info.logPathRel);
  out = out.replace(PLACEHOLDERS.sessionId, info.debugSessionId);
  return `${out}${thisTurnAppendix(info)}`;
}
