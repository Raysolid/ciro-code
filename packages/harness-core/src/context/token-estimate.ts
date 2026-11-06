/** chars/4；非计费真相 */
export function roughTokenEstimate(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** 侧车 tool result 合计（计入 conversation 桶，不另开桶） */
export function sumToolPayloadTokens(records: Array<{ content: string }>): number {
  let n = 0;
  for (const r of records) n += roughTokenEstimate(r.content);
  return n;
}

export type ToolSchemaEstimateInput = {
  name: string;
  description?: string;
  parameters?: unknown;
};

/**
 * 将工具 schema 压成可估 token 的文本（Context `tools` 桶）。
 * 含 name / description / parameters JSON；不含 MCP（另计 `mcp` 桶）。
 */
export function formatToolsForContextEstimate(
  tools: ReadonlyArray<ToolSchemaEstimateInput>,
): string {
  if (tools.length === 0) return '';
  return tools
    .map((t) => {
      let params = '';
      if (t.parameters !== undefined && t.parameters !== null) {
        try {
          params =
            typeof t.parameters === 'string'
              ? t.parameters
              : JSON.stringify(t.parameters);
        } catch {
          params = String(t.parameters);
        }
      }
      return `${t.name}\n${t.description ?? ''}\n${params}`.trimEnd();
    })
    .join('\n\n');
}
