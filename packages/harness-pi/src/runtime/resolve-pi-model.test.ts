import { describe, expect, it } from 'vitest';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { ProviderStore } from '@ciro-code/harness-core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureProviderRegistered, outputTokenBudget, resolvePiModel } from './resolve-pi-model.js';

describe('resolvePiModel vision input', () => {
  it('registers image input when supportsVision', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ciro-vision-'));
    try {
      const providersPath = join(root, 'providers.json');
      const keysPath = join(root, 'keys.json');
      writeFileSync(
        providersPath,
        JSON.stringify({
          providers: [
            {
              id: 'prov_test',
              name: 'Test',
              enabled: true,
              baseUrl: 'https://example.com/v1',
              fullUrl: false,
              apiFormat: 'openai-chat-completions',
              auth: { type: 'bearer' },
              models: [
                {
                  id: 'vision-model',
                  label: 'Vision',
                  enabled: true,
                  supportsVision: true,
                },
                {
                  id: 'text-model',
                  label: 'Text',
                  enabled: true,
                },
              ],
            },
          ],
          defaultModelRef: { providerId: 'prov_test', modelId: 'vision-model' },
        }),
        'utf-8',
      );
      writeFileSync(
        keysPath,
        JSON.stringify({ prov_test: 'sk-test' }),
        'utf-8',
      );

      const store = new ProviderStore({ providersPath, keysPath });
      const mr = await ModelRuntime.create();
      const provider = store.readFile().providers[0]!;
      ensureProviderRegistered(mr, provider);

      const vision = mr.getModel('prov_test', 'vision-model');
      expect(vision?.input).toEqual(expect.arrayContaining(['text', 'image']));
      expect(vision?.maxTokens).toBe(32_768);

      const textOnly = mr.getModel('prov_test', 'text-model');
      expect(textOnly?.input).toEqual(['text']);

      const resolved = await resolvePiModel(mr, store, {
        providerId: 'prov_test',
        modelId: 'vision-model',
      });
      expect(resolved?.modelRef.modelId).toBe('vision-model');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('outputTokenBudget keeps thinking turns above 8k', () => {
    expect(outputTokenBudget(128_000)).toBe(32_768);
    expect(outputTokenBudget(256_000)).toBe(64_000);
    expect(outputTokenBudget(8_192)).toBe(32_768);
  });
});
