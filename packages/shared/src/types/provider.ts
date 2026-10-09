import type { ModelRef } from './primitives.js';

export type ProviderApiFormat = 'openai-chat-completions';

export type ProviderAuthType = 'bearer';

export interface ProviderModelEntry {
  /** 请求用真实 model 字符串 */
  id: string;
  /** 显示名 */
  label: string;
  /** 仅 true → 输入条可见 */
  enabled: boolean;
  /** 用户可编辑的默认上下文窗口 */
  contextLimit?: number;
  /** 拉模 API 返回的官方上限；Max 开且有此值时才抬有效上下文 */
  apiMaxContext?: number;
  supportsThinking?: boolean;
  /** 仅 true → Composer 可粘贴/附加图片 */
  supportsVision?: boolean;
}

export interface ProviderPreset {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  fullUrl: boolean;
  apiFormat: ProviderApiFormat;
  auth: { type: ProviderAuthType };
  models: ProviderModelEntry[];
  fetchedAt?: string;
}

/** 落盘 providers.json（不含 apiKey） */
export interface ProvidersFile {
  providers: ProviderPreset[];
  defaultModelRef?: ModelRef | null;
}

/** GET API：密钥仅 mask，永不返回明文 */
export interface ProviderPresetMasked extends ProviderPreset {
  hasApiKey: boolean;
  apiKeyMask: string | null;
}

export interface ProvidersListResponse {
  providers: ProviderPresetMasked[];
  defaultModelRef: ModelRef | null;
  guidance: {
    hasEnvApiKey: boolean;
    hasProviderApiKey: boolean;
    canImportFromEnv: boolean;
    message?: string;
  };
}

export interface CreateProviderRequest {
  name: string;
  enabled?: boolean;
  baseUrl: string;
  fullUrl?: boolean;
  apiFormat?: ProviderApiFormat;
  auth?: { type: ProviderAuthType };
  apiKey?: string;
  models?: ProviderModelEntry[];
  /** 可选模板预填（不强制） */
  template?: 'deepseek' | 'openai' | 'anthropic' | 'custom';
}

export interface UpdateProviderRequest {
  name?: string;
  enabled?: boolean;
  baseUrl?: string;
  fullUrl?: boolean;
  apiFormat?: ProviderApiFormat;
  auth?: { type: ProviderAuthType };
  /** 省略则保留原 Key；空字符串清除 */
  apiKey?: string;
  models?: ProviderModelEntry[];
}

export interface ProviderTestResult {
  ok: boolean;
  status?: number;
  message: string;
  latencyMs?: number;
}

/** GET /models/available：输入条用，仅已启用模型按 Provider 分组 */
export interface AvailableModelItem {
  id: string;
  label: string;
  contextLimit?: number;
  apiMaxContext?: number;
  supportsThinking?: boolean;
  supportsVision?: boolean;
}

export interface AvailableModelGroup {
  providerId: string;
  providerName: string;
  models: AvailableModelItem[];
}

export interface AvailableModelsResponse {
  groups: AvailableModelGroup[];
  defaultModelRef: ModelRef | null;
}

export interface FetchModelsResult {
  provider: ProviderPresetMasked;
  added: number;
  total: number;
}

export interface ModelChangedPayload {
  modelRef: ModelRef | null;
  previousModelRef?: ModelRef | null;
}
