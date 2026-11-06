import { describe, expect, it } from 'vitest';
import {
  CHAT_IMAGE_MAX_COUNT,
  ChatImageValidationError,
  persistChatImages,
  validateChatImages,
  resolveAttachmentPath,
  loadChatImagesFromRefs,
} from './chat-images.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 1x1 png */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('validateChatImages', () => {
  it('accepts valid png', () => {
    const out = validateChatImages([
      { type: 'image', data: TINY_PNG_B64, mimeType: 'image/png' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.mimeType).toBe('image/png');
  });

  it('rejects unsupported mime', () => {
    expect(() =>
      validateChatImages([{ type: 'image', data: TINY_PNG_B64, mimeType: 'image/svg+xml' }]),
    ).toThrow(ChatImageValidationError);
  });

  it('rejects over count', () => {
    const imgs = Array.from({ length: CHAT_IMAGE_MAX_COUNT + 1 }, () => ({
      type: 'image' as const,
      data: TINY_PNG_B64,
      mimeType: 'image/png',
    }));
    expect(() => validateChatImages(imgs)).toThrow(/最多/);
  });
});

describe('persist and load chat images', () => {
  it('writes under attachments and reloads', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-img-'));
    try {
      const refs = persistChatImages(root, 'msg-1', [
        { type: 'image', data: TINY_PNG_B64, mimeType: 'image/png' },
      ]);
      expect(refs[0]!.path).toBe('attachments/msg-1/0.png');
      const abs = resolveAttachmentPath(root, refs[0]!.path);
      expect(abs).toContain('attachments');
      const loaded = loadChatImagesFromRefs(root, refs);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.mimeType).toBe('image/png');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects path traversal', () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-img-'));
    try {
      expect(() => resolveAttachmentPath(root, '../secret')).toThrow(ChatImageValidationError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
