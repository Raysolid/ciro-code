import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ChatImageContent, HarnessMode, ModelRef } from '@ciro/harness-shared';
import { resolveChatTurnMode } from '@ciro/harness-shared';
import {
  ChatImageValidationError,
  resolveAttachmentPath,
} from '@ciro/harness-core';
import type { AppContext } from '../app-context.js';

export function registerChatRoutes(app: Hono, ctx: AppContext): void {
  const { runtime, sessionStore } = ctx;

  app.post('/api/v1/chat/:sessionId/send', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      message: string;
      mode?: HarnessMode;
      modelRef?: ModelRef;
      messageId?: string;
      images?: ChatImageContent[];
      enabledMcp?: string[];
    }>();
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (runtime.isSessionBusy(sessionId)) {
      return c.json({ error: 'Session is streaming', code: 'SESSION_BUSY' }, 409);
    }

    return streamSSE(c, async (stream) => {
      // C4d-S3：断连只 detach，不 abort；显式 Stop 走 /abort
      stream.onAbort(() => undefined);

      const live = runtime.getSession(sessionId) ?? session;
      const previousMode = live.mode;
      const mode = resolveChatTurnMode(live.mode, body.mode, body.message ?? '');
      if (mode !== live.mode) {
        const updated = await runtime.setMode(sessionId, mode);
        if (updated) {
          await stream.writeSSE({
            event: 'mode_changed',
            data: JSON.stringify({
              type: 'mode_changed',
              ts: Date.now(),
              conversationId: sessionId,
              payload: { mode, previousMode },
            }),
          });
        }
      }

      if (body.modelRef) {
        const prev = runtime.getSession(sessionId)?.modelRef ?? session.modelRef;
        const updated = await runtime.setModelRef(sessionId, body.modelRef);
        if (updated) {
          await stream.writeSSE({
            event: 'model_changed',
            data: JSON.stringify({
              type: 'model_changed',
              ts: Date.now(),
              conversationId: sessionId,
              payload: {
                modelRef: updated.modelRef ?? null,
                previousModelRef: prev ?? null,
              },
            }),
          });
        }
      }

      const turnCtx = {
        sessionId,
        mode,
        workspace: session.workspace,
      };

      try {
        for await (const envelope of runtime.sendMessage(
          sessionId,
          {
            message: body.message ?? '',
            messageId: body.messageId,
            images: body.images,
            enabledMcp: body.enabledMcp,
          },
          turnCtx,
        )) {
          if (stream.aborted) {
            // 停止向已断连客户端推送，但继续 drain hub 直到 turn 结束，
            // 避免 for-await break 取消 sendMessage 订阅。
            continue;
          }
          await stream.writeSSE({
            event: envelope.type,
            data: JSON.stringify(envelope),
          });
        }
      } catch (err) {
        if (stream.aborted) return;
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            type: 'error',
            ts: Date.now(),
            conversationId: sessionId,
            payload: { message: err instanceof Error ? err.message : String(err) },
          }),
        });
      }
    });
  });

  /** 忙态引导：Pi deliverAs steer|followUp（UI 默认 steer；followUp 预留）；非 SSE。idle → 409 SESSION_IDLE */
  app.post('/api/v1/chat/:sessionId/steer', async (c) => {
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      message: string;
      messageId?: string;
      images?: ChatImageContent[];
      deliverAs?: 'steer' | 'followUp';
    }>();
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    try {
      const result = await runtime.steerInFlight(sessionId, {
        message: body.message ?? '',
        messageId: body.messageId,
        images: body.images,
        deliverAs: body.deliverAs === 'followUp' ? 'followUp' : 'steer',
      });
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SESSION_IDLE')) {
        return c.json({ error: 'Session is not streaming', code: 'SESSION_IDLE' }, 409);
      }
      if (err instanceof ChatImageValidationError) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: msg }, 500);
    }
  });

  /** 读取会话图片附件（path 相对 sessionDir，如 attachments/{messageId}/0.png） */
  app.get('/api/v1/chat/:sessionId/attachments', (c) => {
    const sessionId = c.req.param('sessionId');
    const rel = c.req.query('path');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    if (!rel || !sessionStore.eventLog) {
      return c.json({ error: 'Not found' }, 404);
    }
    try {
      const abs = resolveAttachmentPath(sessionStore.eventLog.sessionDir(sessionId), rel);
      if (!existsSync(abs)) {
        return c.json({ error: 'Not found' }, 404);
      }
      const st = statSync(abs);
      const mime =
        rel.endsWith('.png')
          ? 'image/png'
          : rel.endsWith('.jpg') || rel.endsWith('.jpeg')
            ? 'image/jpeg'
            : rel.endsWith('.gif')
              ? 'image/gif'
              : rel.endsWith('.webp')
                ? 'image/webp'
                : 'application/octet-stream';
      const webStream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
      return new Response(webStream, {
        headers: {
          'Content-Type': mime,
          'Content-Length': String(st.size),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (err) {
      if (err instanceof ChatImageValidationError) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: 'Not found' }, 404);
    }
  });

  /** C4d-S3：附着进行中的 turn（刷新后接流）；O3：?fromSeq= 可追赶 */
  app.post('/api/v1/chat/:sessionId/attach', async (c) => {
    const sessionId = c.req.param('sessionId');
    const session = runtime.getSession(sessionId) ?? sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    if (!runtime.isSessionBusy(sessionId)) {
      return c.json({ error: 'Session is not streaming', code: 'SESSION_IDLE' }, 409);
    }

    const rawFromSeq = c.req.query('fromSeq');
    let fromSeq: number | undefined;
    if (rawFromSeq != null && rawFromSeq !== '') {
      const n = Number(rawFromSeq);
      if (Number.isFinite(n) && n >= 0) fromSeq = Math.floor(n);
    }

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => undefined);
      try {
        for await (const envelope of runtime.attachMessage(
          sessionId,
          fromSeq != null ? { fromSeq } : undefined,
        )) {
          if (stream.aborted) break;
          await stream.writeSSE({
            event: envelope.type,
            data: JSON.stringify(envelope),
          });
        }
      } catch (err) {
        if (stream.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        const code = msg.includes('SESSION_IDLE')
          ? 'SESSION_IDLE'
          : msg.includes('NOT_FOUND')
            ? 'SESSION_NOT_FOUND'
            : 'ATTACH_ERROR';
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            type: 'error',
            ts: Date.now(),
            conversationId: sessionId,
            payload: { message: msg, code },
          }),
        });
      }
    });
  });

  app.post('/api/v1/chat/:sessionId/abort', async (c) => {
    const sessionId = c.req.param('sessionId');
    await runtime.abort(sessionId);
    return c.json({ ok: true });
  });
}
