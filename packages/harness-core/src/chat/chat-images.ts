import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, normalize, sep } from 'node:path';
import type { ChatImageAttachmentRef, ChatImageContent } from '@ciro/harness-shared';

export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export class ChatImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatImageValidationError';
  }
}

function estimateBase64Bytes(data: string): number {
  const cleaned = data.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

/** 校验客户端上传的 ImageContent；通过则返回规范化副本 */
export function validateChatImages(
  images: ChatImageContent[] | undefined,
): ChatImageContent[] {
  if (!images?.length) return [];
  if (images.length > CHAT_IMAGE_MAX_COUNT) {
    throw new ChatImageValidationError(`最多附加 ${CHAT_IMAGE_MAX_COUNT} 张图片`);
  }
  const out: ChatImageContent[] = [];
  for (const img of images) {
    if (!img || img.type !== 'image') {
      throw new ChatImageValidationError('无效的图片附件');
    }
    const mime = String(img.mimeType ?? '')
      .trim()
      .toLowerCase();
    if (!CHAT_IMAGE_MIME.has(mime)) {
      throw new ChatImageValidationError(`不支持的图片类型: ${mime || '(empty)'}`);
    }
    const data = String(img.data ?? '').replace(/\s/g, '');
    if (!data) {
      throw new ChatImageValidationError('图片数据为空');
    }
    if (estimateBase64Bytes(data) > CHAT_IMAGE_MAX_BYTES) {
      throw new ChatImageValidationError(
        `单张图片不得超过 ${Math.floor(CHAT_IMAGE_MAX_BYTES / (1024 * 1024))}MB`,
      );
    }
    out.push({ type: 'image', data, mimeType: mime });
  }
  return out;
}

/** 写入 sessionDir/attachments/{messageId}/n.ext，返回相对 sessionDir 的 path */
export function persistChatImages(
  sessionDir: string,
  messageId: string,
  images: ChatImageContent[],
): ChatImageAttachmentRef[] {
  if (!images.length) return [];
  const safeId = basename(messageId);
  if (!safeId || safeId !== messageId || messageId.includes('..')) {
    throw new ChatImageValidationError('无效的 messageId');
  }
  const dir = join(sessionDir, 'attachments', safeId);
  mkdirSync(dir, { recursive: true });
  const refs: ChatImageAttachmentRef[] = [];
  images.forEach((img, i) => {
    const ext = EXT_BY_MIME[img.mimeType] ?? 'bin';
    const fileName = `${i}.${ext}`;
    writeFileSync(join(dir, fileName), Buffer.from(img.data, 'base64'));
    refs.push({
      path: `attachments/${safeId}/${fileName}`.replace(/\\/g, '/'),
      mimeType: img.mimeType,
    });
  });
  return refs;
}

/** 解析相对 sessionDir 的附件路径；拒绝越界 */
export function resolveAttachmentPath(sessionDir: string, relPath: string): string {
  const normalized = normalize(relPath).replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('..') ||
    normalized.includes('/../') ||
    normalized.startsWith('/') ||
    !normalized.startsWith('attachments/')
  ) {
    throw new ChatImageValidationError('非法附件路径');
  }
  const abs = join(sessionDir, ...normalized.split('/'));
  const root = normalize(sessionDir + sep);
  const resolved = normalize(abs);
  if (!resolved.startsWith(root) && resolved !== normalize(sessionDir)) {
    throw new ChatImageValidationError('非法附件路径');
  }
  return resolved;
}

export function loadChatImagesFromRefs(
  sessionDir: string,
  refs: ChatImageAttachmentRef[] | undefined,
): ChatImageContent[] {
  if (!refs?.length) return [];
  const out: ChatImageContent[] = [];
  for (const ref of refs) {
    const abs = resolveAttachmentPath(sessionDir, ref.path);
    if (!existsSync(abs)) continue;
    const data = readFileSync(abs).toString('base64');
    out.push({ type: 'image', data, mimeType: ref.mimeType });
  }
  return out;
}
