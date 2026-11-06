import type { SseEnvelope } from '@ciro-code/harness-shared';

/** O3：更新客户端 watermark（仅当事件带 seq） */
export function noteEventSeq(
  refs: { lastSeq: number | null },
  event: Pick<SseEnvelope, 'seq'>,
): void {
  if (typeof event.seq !== 'number' || !Number.isFinite(event.seq)) return;
  refs.lastSeq =
    refs.lastSeq == null ? event.seq : Math.max(refs.lastSeq, event.seq);
}
