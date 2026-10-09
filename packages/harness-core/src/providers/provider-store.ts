import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AvailableModelGroup,
  AvailableModelsResponse,
  CreateProviderRequest,
  FetchModelsResult,
  ModelRef,
  ProviderModelEntry,
  ProviderPreset,
  ProviderPresetMasked,
  ProvidersFile,
  ProvidersListResponse,
  UpdateProviderRequest,
} from '@ciro/harness-shared';
import { hasApiKey } from '../config/load-config.js';
import {
  legacyPathWarning,
  legacyProviderKeysPath,
  legacyProvidersPath,
  providerKeysPath,
  providersPath,
  resolveReadable,
} from '../paths/product-paths.js';
import { fetchRemoteModelList, mergeFetchedModels } from './fetch-models.js';
import { validateProviderBaseUrl } from './validate-provider-url.js';

export function defaultProvidersPath(): string {
  return providersPath();
}

export function defaultProviderKeysPath(): string {
  return providerKeysPath();
}

export interface ProviderStoreOptions {
  providersPath?: string;
  keysPath?: string;
  /** 测试可注入（连通 / fetch-models） */
  fetchImpl?: typeof fetch;
}

type KeysFile = Record<string, string>;

function emptyFile(): ProvidersFile {
  return { providers: [], defaultModelRef: null };
}

function maskApiKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function normalizeModels(models: ProviderModelEntry[] | undefined): ProviderModelEntry[] {
  if (!models?.length) return [];
  return models.map((m) => ({
    id: m.id,
    label: m.label || m.id,
    enabled: Boolean(m.enabled),
    contextLimit: m.contextLimit,
    apiMaxContext: m.apiMaxContext,
    supportsThinking: m.supportsThinking,
    supportsVision: m.supportsVision,
  }));
}

function templateDefaults(
  template: CreateProviderRequest['template'],
): Partial<Pick<ProviderPreset, 'baseUrl' | 'models'>> {
  switch (template) {
    case 'deepseek':
      return {
        baseUrl: 'https://api.deepseek.com/v1',
        models: [
          {
            id: 'deepseek-chat',
            label: 'DeepSeek Chat',
            enabled: false,
            contextLimit: 128000,
          },
        ],
      };
    case 'openai':
      return {
        baseUrl: 'https://api.openai.com/v1',
        models: [],
      };
    case 'anthropic':
      return {
        baseUrl: 'https://api.anthropic.com/v1',
        models: [],
      };
    default:
      return {};
  }
}

export class ProviderStore {
  readonly providersPath: string;
  readonly keysPath: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly useLegacyRead: boolean;

  constructor(opts: ProviderStoreOptions = {}) {
    this.providersPath = opts.providersPath ?? defaultProvidersPath();
    this.keysPath = opts.keysPath ?? defaultProviderKeysPath();
    this.fetchImpl = opts.fetchImpl;
    this.useLegacyRead = !opts.providersPath && !opts.keysPath;
  }

  private resolveProvidersReadPath(): string {
    if (!this.useLegacyRead) return this.providersPath;
    const resolved = resolveReadable(this.providersPath, legacyProvidersPath());
    if (resolved.fromLegacy) {
      console.warn(`[ciro] ${legacyPathWarning('providers.json', legacyProvidersPath())}`);
    }
    return resolved.path;
  }

  private resolveKeysReadPath(): string {
    if (!this.useLegacyRead) return this.keysPath;
    const resolved = resolveReadable(this.keysPath, legacyProviderKeysPath());
    if (resolved.fromLegacy) {
      console.warn(`[ciro] ${legacyPathWarning('provider-keys.json', legacyProviderKeysPath())}`);
    }
    return resolved.path;
  }

  readFile(): ProvidersFile {
    const raw = readJsonFile<ProvidersFile>(this.resolveProvidersReadPath(), emptyFile());
    return {
      providers: Array.isArray(raw.providers) ? raw.providers : [],
      defaultModelRef: raw.defaultModelRef ?? null,
    };
  }

  private readKeys(): KeysFile {
    const raw = readJsonFile<KeysFile>(this.resolveKeysReadPath(), {});
    return raw && typeof raw === 'object' ? raw : {};
  }

  private writeFile(file: ProvidersFile): void {
    writeJson(this.providersPath, file);
  }

  private writeKeys(keys: KeysFile): void {
    writeJson(this.keysPath, keys);
  }

  getApiKey(providerId: string): string | undefined {
    const key = this.readKeys()[providerId];
    return typeof key === 'string' && key.length > 0 ? key : undefined;
  }

  hasAnyProviderApiKey(): boolean {
    return Object.values(this.readKeys()).some((k) => typeof k === 'string' && k.length > 0);
  }

  listMasked(): ProvidersListResponse {
    const file = this.readFile();
    const keys = this.readKeys();
    const hasEnv = hasApiKey();
    const hasProvider = this.hasAnyProviderApiKey();
    const providers = file.providers.map((p) => this.toMasked(p, keys[p.id]));

    let message: string | undefined;
    if (providers.length === 0 && !hasEnv) {
      message = '尚未配置模型。请添加 Provider 并填入 API Key，或设置环境变量后导入。';
    } else if (providers.length === 0 && hasEnv) {
      message = '检测到环境变量中的 API Key，可一键导入为默认 Provider。';
    } else if (!hasProvider && !hasEnv) {
      message = '已有 Provider，但尚未配置 API Key。';
    }

    return {
      providers,
      defaultModelRef: file.defaultModelRef ?? null,
      guidance: {
        hasEnvApiKey: hasEnv,
        hasProviderApiKey: hasProvider,
        canImportFromEnv: hasEnv,
        message,
      },
    };
  }

  getMasked(id: string): ProviderPresetMasked | undefined {
    const p = this.readFile().providers.find((x) => x.id === id);
    if (!p) return undefined;
    return this.toMasked(p, this.getApiKey(id));
  }

  create(input: CreateProviderRequest): ProviderPresetMasked {
    const tpl = templateDefaults(input.template);
    const baseUrlRaw = input.baseUrl?.trim() || tpl.baseUrl || '';
    const urlCheck = validateProviderBaseUrl(baseUrlRaw);
    if (!urlCheck.ok) throw new Error(urlCheck.error);

    const id = `prov_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const preset: ProviderPreset = {
      id,
      name: input.name.trim() || 'Provider',
      enabled: input.enabled ?? true,
      baseUrl: urlCheck.url,
      fullUrl: input.fullUrl ?? false,
      apiFormat: input.apiFormat ?? 'openai-chat-completions',
      auth: input.auth ?? { type: 'bearer' },
      models: normalizeModels(input.models ?? tpl.models),
    };

    const file = this.readFile();
    file.providers.push(preset);
    if (!file.defaultModelRef) {
      const firstEnabled = preset.models.find((m) => m.enabled);
      if (firstEnabled) {
        file.defaultModelRef = { providerId: id, modelId: firstEnabled.id };
      }
    }
    this.writeFile(file);

    if (input.apiKey?.trim()) {
      const keys = this.readKeys();
      keys[id] = input.apiKey.trim();
      this.writeKeys(keys);
    }

    return this.toMasked(preset, this.getApiKey(id));
  }

  update(id: string, input: UpdateProviderRequest): ProviderPresetMasked {
    const file = this.readFile();
    const idx = file.providers.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`Provider not found: ${id}`);

    const prev = file.providers[idx]!;
    let baseUrl = prev.baseUrl;
    if (input.baseUrl !== undefined) {
      const urlCheck = validateProviderBaseUrl(input.baseUrl);
      if (!urlCheck.ok) throw new Error(urlCheck.error);
      baseUrl = urlCheck.url;
    }

    const next: ProviderPreset = {
      ...prev,
      name: input.name?.trim() || prev.name,
      enabled: input.enabled ?? prev.enabled,
      baseUrl,
      fullUrl: input.fullUrl ?? prev.fullUrl,
      apiFormat: input.apiFormat ?? prev.apiFormat,
      auth: input.auth ?? prev.auth,
      models: input.models !== undefined ? normalizeModels(input.models) : prev.models,
    };
    file.providers[idx] = next;

    if (file.defaultModelRef?.providerId === id) {
      const stillOk =
        next.enabled &&
        next.models.some((m) => m.id === file.defaultModelRef!.modelId && m.enabled);
      if (!stillOk) {
        file.defaultModelRef = this.pickFallbackRef(file.providers, id) ?? null;
      }
    }

    this.writeFile(file);

    if (input.apiKey !== undefined) {
      const keys = this.readKeys();
      const trimmed = input.apiKey.trim();
      if (!trimmed) delete keys[id];
      else keys[id] = trimmed;
      this.writeKeys(keys);
    }

    return this.toMasked(next, this.getApiKey(id));
  }

  delete(id: string): boolean {
    const file = this.readFile();
    const before = file.providers.length;
    file.providers = file.providers.filter((p) => p.id !== id);
    if (file.providers.length === before) return false;

    if (file.defaultModelRef?.providerId === id) {
      file.defaultModelRef = this.pickFallbackRef(file.providers) ?? null;
    }
    this.writeFile(file);

    const keys = this.readKeys();
    if (keys[id] !== undefined) {
      delete keys[id];
      this.writeKeys(keys);
    }
    return true;
  }

  setDefaultModelRef(ref: ModelRef | null): void {
    const file = this.readFile();
    if (ref) {
      const p = file.providers.find((x) => x.id === ref.providerId);
      if (!p) throw new Error(`Provider not found: ${ref.providerId}`);
      if (!p.models.some((m) => m.id === ref.modelId)) {
        throw new Error(`Model not found: ${ref.modelId}`);
      }
    }
    file.defaultModelRef = ref;
    this.writeFile(file);
  }

  /** 拉取远程模型并合并；新模型默认未启用 */
  async fetchModels(
    id: string,
    opts?: { fetchImpl?: typeof fetch },
  ): Promise<FetchModelsResult> {
    const file = this.readFile();
    const idx = file.providers.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`Provider not found: ${id}`);
    const provider = file.providers[idx]!;
    const apiKey = this.getApiKey(id);
    const remote = await fetchRemoteModelList(provider, apiKey, {
      fetchImpl: opts?.fetchImpl ?? this.fetchImpl,
    });
    if (!remote.ok) throw new Error(remote.error);

    const { models, added } = mergeFetchedModels(provider.models, remote.models);
    const next: ProviderPreset = {
      ...provider,
      models,
      fetchedAt: new Date().toISOString(),
    };
    file.providers[idx] = next;
    this.writeFile(file);
    return {
      provider: this.toMasked(next, apiKey),
      added,
      total: models.length,
    };
  }

  listAvailable(): AvailableModelsResponse {
    const file = this.readFile();
    const groups: AvailableModelGroup[] = [];
    for (const p of file.providers) {
      if (!p.enabled) continue;
      const models = p.models
        .filter((m) => m.enabled)
        .map((m) => ({
          id: m.id,
          label: m.label || m.id,
          contextLimit: m.contextLimit,
          apiMaxContext: m.apiMaxContext,
          supportsThinking: m.supportsThinking,
          supportsVision: m.supportsVision,
        }));
      if (models.length === 0) continue;
      groups.push({
        providerId: p.id,
        providerName: p.name,
        models,
      });
    }
    return {
      groups,
      defaultModelRef: file.defaultModelRef ?? null,
    };
  }

  /** 从环境变量导入为默认 Provider（Should） */
  importFromEnv(): ProviderPresetMasked | null {
    if (!hasApiKey()) return null;

    const existing = this.readFile().providers;
    if (existing.length > 0) {
      throw new Error('Providers already configured; import-from-env only when empty');
    }

    const deepseek = process.env.DEEPSEEK_API_KEY?.trim();
    const openai = process.env.OPENAI_API_KEY?.trim();
    const anthropic = process.env.ANTHROPIC_API_KEY?.trim();

    if (deepseek) {
      return this.create({
        name: 'DeepSeek (from env)',
        template: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: deepseek,
        models: [
          {
            id: 'deepseek-chat',
            label: 'DeepSeek Chat',
            enabled: true,
            contextLimit: 128000,
          },
        ],
      });
    }
    if (openai) {
      return this.create({
        name: 'OpenAI (from env)',
        template: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openai,
      });
    }
    if (anthropic) {
      return this.create({
        name: 'Anthropic (from env)',
        template: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: anthropic,
      });
    }
    return null;
  }

  resolveCredentials(ref: ModelRef): {
    provider: ProviderPreset;
    apiKey: string;
    model: ProviderModelEntry;
  } | null {
    const file = this.readFile();
    const provider = file.providers.find((p) => p.id === ref.providerId);
    if (!provider || !provider.enabled) return null;
    const model = provider.models.find((m) => m.id === ref.modelId && m.enabled);
    if (!model) return null;
    const apiKey = this.getApiKey(provider.id);
    if (!apiKey) return null;
    return { provider, apiKey, model };
  }

  /**
   * 解析可用模型：preferred → 同 Provider 下一启用 → defaultModelRef → 第一个 available。
   * 若均不可用返回 null（调用方提示打开模型设置）。
   */
  resolveEffectiveModelRef(preferred?: ModelRef | null): ModelRef | null {
    if (preferred && this.resolveCredentials(preferred)) {
      return preferred;
    }
    if (preferred) {
      const file = this.readFile();
      const p = file.providers.find((x) => x.id === preferred.providerId && x.enabled);
      const next = p?.models.find((m) => m.enabled && m.id !== preferred.modelId);
      if (next && this.resolveCredentials({ providerId: p!.id, modelId: next.id })) {
        return { providerId: p!.id, modelId: next.id };
      }
    }
    const file = this.readFile();
    const def = file.defaultModelRef;
    if (def && this.resolveCredentials(def)) return def;
    const available = this.listAvailable();
    const first = available.groups[0]?.models[0];
    const firstProvider = available.groups[0]?.providerId;
    if (first && firstProvider) {
      const ref = { providerId: firstProvider, modelId: first.id };
      if (this.resolveCredentials(ref)) return ref;
    }
    return null;
  }

  private pickFallbackRef(providers: ProviderPreset[], excludeId?: string): ModelRef | undefined {
    for (const p of providers) {
      if (!p.enabled || p.id === excludeId) continue;
      const m = p.models.find((x) => x.enabled);
      if (m) return { providerId: p.id, modelId: m.id };
    }
    return undefined;
  }

  private toMasked(p: ProviderPreset, apiKey: string | undefined): ProviderPresetMasked {
    return {
      ...p,
      hasApiKey: Boolean(apiKey),
      apiKeyMask: maskApiKey(apiKey),
    };
  }
}
