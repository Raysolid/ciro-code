import { describe, expect, it, vi } from 'vitest';
import { BROWSER_MCP_NOT_READY_MESSAGE } from '@ciro-code/harness-shared';
import type { SubagentOrchestrator } from '@ciro-code/harness-core';
import { createTaskTool } from './task-tool.js';

function stubOrchestrator(): SubagentOrchestrator {
  return {
    runExplore: vi.fn(async () => ({
      ok: true,
      status: 'completed' as const,
      taskId: 'task-1',
      toolResultText: JSON.stringify({
        conclusion: 'ok',
        paths: [],
        symbols: [],
        openQuestions: [],
        confidence: 'high',
      }),
      summary: {
        conclusion: 'ok',
        paths: [],
        symbols: [],
        openQuestions: [],
        confidence: 'high' as const,
      },
    })),
  } as unknown as SubagentOrchestrator;
}

function schemaBlob(tool: { description: string; parameters: unknown }): string {
  return `${tool.description}\n${JSON.stringify(tool.parameters)}`;
}

describe('createTaskTool browser gate', () => {
  it('hides browser from schema when includeBrowser is false', () => {
    const tool = createTaskTool({
      sessionId: 's1',
      workspace: '/tmp',
      orchestrator: stubOrchestrator(),
      includeBrowser: false,
    });
    const blob = schemaBlob(tool);
    expect(blob).not.toMatch(/"browser"/);
    expect(tool.description).not.toMatch(/browser:/i);
    expect(tool.description).toMatch(/explore/);
  });

  it('exposes browser in schema when includeBrowser is true', () => {
    const tool = createTaskTool({
      sessionId: 's1',
      workspace: '/tmp',
      orchestrator: stubOrchestrator(),
      includeBrowser: true,
    });
    const blob = schemaBlob(tool);
    expect(blob).toMatch(/"browser"/);
    expect(tool.description).toMatch(/browser:/i);
    expect(tool.description).toMatch(/Playwright/i);
  });

  it('fails execute when browser requested but not available', async () => {
    const orch = stubOrchestrator();
    const tool = createTaskTool({
      sessionId: 's1',
      workspace: '/tmp',
      orchestrator: orch,
      includeBrowser: true,
      isBrowserAvailable: () => false,
    });
    const result = await tool.execute(
      'tc1',
      {
        subagent_type: 'browser',
        prompt: 'open docs',
      },
      undefined,
      undefined,
      {} as never,
    );
    const text = String((result.content[0] as { text: string }).text);
    expect(text).toBe(BROWSER_MCP_NOT_READY_MESSAGE);
    expect(result.details?.error).toBe(true);
    expect(orch.runExplore).not.toHaveBeenCalled();
  });

  it('runs browser when available', async () => {
    const orch = stubOrchestrator();
    const tool = createTaskTool({
      sessionId: 's1',
      workspace: '/tmp',
      orchestrator: orch,
      includeBrowser: true,
      isBrowserAvailable: () => true,
    });
    const result = await tool.execute(
      'tc1',
      {
        subagent_type: 'browser',
        prompt: 'open docs',
        title: 'Docs',
      },
      undefined,
      undefined,
      {} as never,
    );
    expect(result.details?.error).toBe(false);
    expect(orch.runExplore).toHaveBeenCalledWith(
      expect.objectContaining({
        subagentType: 'browser',
        prompt: 'open docs',
        title: 'Docs',
      }),
    );
  });
});
