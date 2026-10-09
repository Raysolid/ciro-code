import type { HarnessConfig } from '@ciro/harness-shared';
import type { AgentRuntime, CreateRuntimeOptions } from '@ciro/harness-core';
import { PiAgentRuntime } from './runtime/pi-agent-runtime.js';
import { MockAgentRuntime } from './runtime/mock-agent-runtime.js';

export function createAgentRuntime(
  config: HarnessConfig,
  options: CreateRuntimeOptions = {},
): AgentRuntime {
  if (config.agentBackend === 'mock') {
    return new MockAgentRuntime(config, options);
  }
  return new PiAgentRuntime(config, options);
}

export { PiAgentRuntime } from './runtime/pi-agent-runtime.js';
export { MockAgentRuntime } from './runtime/mock-agent-runtime.js';
export { createSandboxedReadTool } from './tools/read-tool.js';
export { createSandboxedListFilesTool } from './tools/list-files-tool.js';
export { createSandboxedGrepTool } from './tools/grep-tool.js';
export { createSandboxedWriteTool, createSandboxedEditTool } from './tools/write-edit-tool.js';
export { createSandboxedBashTool } from './tools/bash-tool.js';
export {
  createAskQuestionTool,
  createCreatePlanTool,
  createUpdatePlanTool,
  createProposePlanTool,
} from './tools/plan-tools.js';
export { createSuggestModeTool } from './tools/mode-suggest-tool.js';
export { createSandboxedDeleteFileTool } from './tools/delete-file-tool.js';
export { createTodoWriteTool } from './tools/todo-write-tool.js';
