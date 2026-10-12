/** Workspace Git 状态（@ciro-code/ext-git 面板） */

/** porcelain 推导的工作区分区 */
export type GitFileArea = 'staged' | 'unstaged' | 'unmerged' | 'untracked';

export type GitFileStatus = {
  /** porcelain XY 码，如 " M" / "M " / "??" */
  code: string;
  path: string;
  /** Working 列表分区；缺省由 UI 按 code 兜底为 unstaged */
  area?: GitFileArea;
  additions?: number;
  deletions?: number;
};

export type GitWorkspaceStatus = {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirty: boolean;
  entries: GitFileStatus[];
  /** `git status -sb` 首行摘要 */
  shortStatus: string | null;
  error?: string;
};

export type GitCommitSummary = {
  hash: string;
  shortHash: string;
  author: string;
  authoredAt: string;
  subject: string;
  /** 父提交 hash（新→旧；用于 IDEA 风格提交图） */
  parents?: string[];
  /** 悬停提示用：最接近的分支名（name-rev / tip） */
  branchHint?: string;
};

export type GitCommitFile = {
  path: string;
  /** A/M/D/R… */
  status: string;
  additions: number;
  deletions: number;
};

export type GitCommitDetail = GitCommitSummary & {
  body: string;
  files: GitCommitFile[];
};

export type GitDiffPayload = {
  path: string;
  unifiedDiff: string;
  truncated: boolean;
};

export type GitDiffSide = 'worktree' | 'index';

export type GitBranchSummary = {
  name: string;
  current: boolean;
  /** local = refs/heads；remote = refs/remotes */
  scope?: 'local' | 'remote';
};

/** 写操作通用结果 */
export type GitWriteResult = { ok: true } | { ok: false; error: string };
