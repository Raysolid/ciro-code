/** Full compact 唯一摘要通道：产出可注入 Markdown（无 structured 双轨） */
export interface FullCompactSummarizerInput {
  conversationText: string;
  previousSummary?: string;
  sessionMemory?: string;
  /** 供实现解析会话当前 modelRef */
  sessionId?: string;
}

export interface FullCompactSummarizer {
  summarize(input: FullCompactSummarizerInput): Promise<string>;
}

/** 测试 / Mock：固定 Markdown，不打网 */
export function createStubFullCompactSummarizer(
  markdown = `# Compaction summary

## Primary Request and Intent
- stub compact for tests

## Current Work
- continuing after compaction

## Optional Next Step
- proceed with the user's latest request
`,
): FullCompactSummarizer {
  return {
    async summarize() {
      return markdown.trim();
    },
  };
}
