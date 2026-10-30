/** 锁实现在 harness-core；TUI 再导出方便本地引用 */
export {
  acquireWorkspaceLock,
  releaseWorkspaceLock,
  readWorkspaceLock,
  workspaceLockPath,
  type LockKind,
  type WorkspaceLockInfo,
} from '@ciro-code/harness-core';
