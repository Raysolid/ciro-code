import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { roughTokenEstimate } from '../context/token-estimate.js';

export interface StoredToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
  storedAt: string;
  tokenCount: number;
  /** inline | preview | pointer */
  retention: 'inline' | 'preview' | 'pointer';
  preview?: string;
}

export class ToolResultStore {
  constructor(private readonly sessionDir: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  get dir(): string {
    return join(this.sessionDir, 'tool-results');
  }

  pathFor(toolCallId: string): string {
    const safe = toolCallId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dir, `${safe}.json`);
  }

  write(
    toolCallId: string,
    toolName: string,
    content: string,
    retention: StoredToolResult['retention'] = 'inline',
  ): StoredToolResult {
    const preview = buildPreview(toolName, content);
    const entry: StoredToolResult = {
      toolCallId,
      toolName,
      content: retention === 'pointer' ? '' : content,
      storedAt: new Date().toISOString(),
      tokenCount: roughTokenEstimate(content),
      retention,
      preview,
    };
    if (retention === 'pointer') {
      // full body on disk; in-memory/index holds preview only
      writeFileSync(
        this.pathFor(toolCallId),
        JSON.stringify({ ...entry, content }, null, 2),
        'utf-8',
      );
      return { ...entry, content: '', preview };
    }
    writeFileSync(this.pathFor(toolCallId), JSON.stringify(entry, null, 2), 'utf-8');
    return entry;
  }

  read(toolCallId: string): StoredToolResult | undefined {
    const path = this.pathFor(toolCallId);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as StoredToolResult;
    } catch {
      return undefined;
    }
  }

  list(): StoredToolResult[] {
    if (!existsSync(this.dir)) return [];
    const out: StoredToolResult[] = [];
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(readFileSync(join(this.dir, name), 'utf-8')) as StoredToolResult);
      } catch {
        // skip
      }
    }
    return out;
  }

  /** 将已有 full 结果降级为 pointer（磁盘保留全文，返回预览） */
  externalize(toolCallId: string): StoredToolResult | undefined {
    const existing = this.read(toolCallId);
    if (!existing) return undefined;
    if (existing.retention === 'pointer') return existing;
    const full = existing.content || '';
    return this.write(toolCallId, existing.toolName, full, 'pointer');
  }
}

/** 按工具类型生成智能预览 */
export function buildPreview(toolName: string, content: string, maxChars = 400): string {
  if (!content) return '';
  const name = toolName.toLowerCase();
  if (name === 'grep') {
    return content.length <= maxChars * 2 ? content : content.slice(0, maxChars * 2) + '\n…';
  }
  if (name === 'bash' || name === 'shell') {
    if (content.length <= maxChars) return content;
    return '…\n' + content.slice(-maxChars);
  }
  if (name === 'read' || name === 'list_files') {
    const lines = content.split('\n');
    if (content.length <= maxChars) return content;
    const head = lines.slice(0, 8).join('\n');
    const tail = lines.slice(-4).join('\n');
    return `${head}\n…\n${tail}`;
  }
  return content.length <= maxChars ? content : content.slice(0, maxChars) + '\n…';
}
