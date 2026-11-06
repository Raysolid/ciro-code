/** Agent Extension 清单（§9.2 Host：Trust 后按 main 加载） */
export type ExtensionManifest = {
  id: string;
  name: string;
  version: string;
  /** 相对扩展目录的 ESM 入口；缺省时仍可出现在列表，Trust 后加载失败 */
  main?: string;
};

export type ExtensionListItem = {
  id: string;
  name: string;
  version: string;
  path: string;
  trusted: boolean;
  /** 仅 Trust 后加载失败时出现 */
  loadError?: string;
};

export type ExtensionsListResponse = {
  extensions: ExtensionListItem[];
};

export type ExtensionUiNotifyLevel = 'success' | 'error' | 'info';
