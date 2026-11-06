/**
 * Detached daemon boot（供 TUI ensureHarnessDaemon spawn）。
 * 环境变量：CIRO_WORKSPACE、CIRO_PORT、CIRO_AGENT_BACKEND、CIRO_HOST
 */
import { startHarnessServer } from './index.js';
import type { HarnessMode } from '@ciro-code/harness-shared';

const workspace = process.env.CIRO_WORKSPACE;
process.env.CIRO_DAEMON_AUTO_STOP = process.env.CIRO_DAEMON_AUTO_STOP || '1';
const port = Number(process.env.CIRO_PORT || '5280');
const host = process.env.CIRO_HOST || '127.0.0.1';
const agentBackend =
  process.env.CIRO_AGENT_BACKEND === 'mock' ? 'mock' : ('pi' as const);
const mode = process.env.CIRO_MODE as HarnessMode | undefined;

if (!workspace) {
  console.error('[daemon] CIRO_WORKSPACE required');
  process.exit(1);
}

const { config } = await startHarnessServer({
  workspace,
  port,
  host,
  agentBackend,
  mode:
    mode === 'ask' || mode === 'plan' || mode === 'agent' || mode === 'debug'
      ? mode
      : undefined,
  workspacePinned: true,
  workspaceLock: true,
});

console.log(
  `[daemon] ready http://${config.bind.host}:${config.bind.port} workspace=${config.workspace}`,
);
