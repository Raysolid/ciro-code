/** UI 无关翻译回调（不绑定 Web MessageKey，避免拖入 i18n 字典） */
export type MessageVars = Record<string, string | number>;

/**
 * 与 Web `TranslateFn`(MessageKey) 双向兼容：
 * 参数位置用 bivarianceHack，避免 string vs MessageKey 逆变报错。
 */
export type TranslateFn = {
  bivarianceHack(key: string, vars?: MessageVars): string;
}['bivarianceHack'];
