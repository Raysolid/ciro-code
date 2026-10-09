import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { ModelRef, ProviderModelEntry, ProviderPreset } from '@ciro/harness-shared';
import type { ProviderStore } from '@ciro/harness-core';

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_CONTEXT_WINDOW = 128_000;
/** 思考流计入输出额度；8192 会被 medium 思考打满后静默 complete */
const MIN_OUTPUT_TOKENS = 32_768;
const MAX_OUTPUT_TOKENS = 65_536;

export function outputTokenBudget(contextWindow: number): number {
  const quarter = Math.floor(contextWindow / 4);
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, quarter));
}

export type PiResolvedModel = NonNullable<ReturnType<ModelRuntime['getModel']>>;

function toProviderModels(
  models: ProviderModelEntry[],
  override?: { modelId: string; contextWindow: number },
) {
  return models.map((m) => {
    const contextWindow =
      override && m.id === override.modelId
        ? override.contextWindow
        : (m.contextLimit ?? DEFAULT_CONTEXT_WINDOW);
    return {
      id: m.id,
      name: m.label || m.id,
      reasoning: Boolean(m.supportsThinking),
      input: (m.supportsVision ? ['text', 'image'] : ['text']) as Array<'text' | 'image'>,
      cost: ZERO_COST,
      contextWindow,
      maxTokens: outputTokenBudget(contextWindow),
    };
  });
}

/**
 * 将 Harness Provider 注册进 Pi ModelRuntime，并返回对应 Model。
 * providerId 使用我们的 prov_*，与 Mode 正交。
 */
export async function resolvePiModel(
  modelRuntime: ModelRuntime,
  providerStore: ProviderStore,
  preferred?: ModelRef | null,
  opts?: { contextWindow?: number },
): Promise<{ model: PiResolvedModel; modelRef: ModelRef } | null> {
  const modelRef = providerStore.resolveEffectiveModelRef(preferred);
  if (!modelRef) return null;

  const creds = providerStore.resolveCredentials(modelRef);
  if (!creds) return null;

  ensureProviderRegistered(
    modelRuntime,
    creds.provider,
    opts?.contextWindow != null
      ? { modelId: modelRef.modelId, contextWindow: opts.contextWindow }
      : undefined,
  );
  await modelRuntime.setRuntimeApiKey(creds.provider.id, creds.apiKey);

  const model = modelRuntime.getModel(creds.provider.id, creds.model.id);
  if (!model) return null;
  return { model, modelRef };
}

export function ensureProviderRegistered(
  modelRuntime: ModelRuntime,
  provider: ProviderPreset,
  override?: { modelId: string; contextWindow: number },
): void {
  modelRuntime.registerProvider(provider.id, {
    name: provider.name,
    baseUrl: provider.baseUrl.replace(/\/$/, ''),
    api: 'openai-completions',
    authHeader: true,
    models: toProviderModels(provider.models, override),
  });
}
