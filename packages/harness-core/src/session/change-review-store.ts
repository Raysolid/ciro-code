import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChangeDisposition } from '@ciro-code/harness-shared';
import { assertWritable } from '../sandbox/path-sandbox.js';

export interface ChangeReviewMeta {
  path: string;
  created: boolean;
  disposition: ChangeDisposition;
  updatedAt: number;
}

export class ChangeReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeReviewError';
  }
}

function safeKey(path: string): string {
  const norm = path.replace(/\\/g, '/');
  return createHash('sha256').update(norm).digest('hex').slice(0, 32);
}

/** sessionDir/change-reviews：baseline/after 快照 + disposition */
export class ChangeReviewStore {
  constructor(private readonly sessionDir: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  get dir(): string {
    return join(this.sessionDir, 'change-reviews');
  }

  private key(path: string): string {
    return safeKey(path);
  }

  private metaPath(path: string): string {
    return join(this.dir, `${this.key(path)}.json`);
  }

  private beforePath(path: string): string {
    return join(this.dir, `${this.key(path)}.before`);
  }

  private afterPath(path: string): string {
    return join(this.dir, `${this.key(path)}.after`);
  }

  readMeta(path: string): ChangeReviewMeta | undefined {
    const p = this.metaPath(path);
    if (!existsSync(p)) return undefined;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as ChangeReviewMeta;
      if (typeof raw.path !== 'string') return undefined;
      return raw;
    } catch {
      return undefined;
    }
  }

  hasSnapshots(path: string): boolean {
    return existsSync(this.beforePath(path)) && existsSync(this.afterPath(path));
  }

  /**
   * write/edit 成功后调用。
   * disposition 为 pending 时保留首次 baseline，只更新 after；
   * 否则开启新审阅链（baseline = 本次 before）。
   */
  recordEdit(path: string, before: string, after: string): ChangeReviewMeta {
    const existing = this.readMeta(path);
    const keepBaseline = existing?.disposition === 'pending' && this.hasSnapshots(path);
    const created = keepBaseline ? existing!.created : before.length === 0;
    const baseline = keepBaseline ? readFileSync(this.beforePath(path), 'utf-8') : before;

    writeFileSync(this.beforePath(path), baseline, 'utf-8');
    writeFileSync(this.afterPath(path), after, 'utf-8');

    const meta: ChangeReviewMeta = {
      path,
      created,
      disposition: 'pending',
      updatedAt: Date.now(),
    };
    writeFileSync(this.metaPath(path), JSON.stringify(meta, null, 2), 'utf-8');
    return meta;
  }

  listDispositions(): Map<string, { disposition: ChangeDisposition; reviewable: boolean }> {
    const out = new Map<string, { disposition: ChangeDisposition; reviewable: boolean }>();
    if (!existsSync(this.dir)) return out;
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(
          readFileSync(join(this.dir, name), 'utf-8'),
        ) as ChangeReviewMeta;
        if (typeof raw.path !== 'string') continue;
        const disposition =
          raw.disposition === 'accepted' || raw.disposition === 'rejected'
            ? raw.disposition
            : 'pending';
        out.set(raw.path, {
          disposition,
          reviewable: this.hasSnapshots(raw.path),
        });
      } catch {
        // skip corrupt
      }
    }
    return out;
  }

  accept(workspace: string, path: string): ChangeReviewMeta {
    const meta = this.readMeta(path);
    if (!meta || !this.hasSnapshots(path)) {
      throw new ChangeReviewError(
        `无法接受：缺少改前快照（会话创建于闭环上线前或快照已丢失）: ${path}`,
      );
    }
    const after = readFileSync(this.afterPath(path), 'utf-8');
    const abs = assertWritable(workspace, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, after, 'utf-8');

    const next: ChangeReviewMeta = {
      ...meta,
      disposition: 'accepted',
      updatedAt: Date.now(),
    };
    writeFileSync(this.metaPath(path), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  reject(workspace: string, path: string): ChangeReviewMeta {
    const meta = this.readMeta(path);
    if (!meta || !this.hasSnapshots(path)) {
      throw new ChangeReviewError(
        `无法回滚：缺少改前快照（会话创建于闭环上线前或快照已丢失）: ${path}`,
      );
    }
    const abs = assertWritable(workspace, path);
    if (meta.created) {
      if (existsSync(abs)) {
        try {
          unlinkSync(abs);
        } catch (err) {
          throw new ChangeReviewError(
            `无法删除新建文件 ${path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      const baseline = readFileSync(this.beforePath(path), 'utf-8');
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, baseline, 'utf-8');
    }

    const next: ChangeReviewMeta = {
      ...meta,
      disposition: 'rejected',
      updatedAt: Date.now(),
    };
    writeFileSync(this.metaPath(path), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }
}

/** 测试/清理用 */
export function removeChangeReviews(sessionDir: string): void {
  const dir = join(sessionDir, 'change-reviews');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
