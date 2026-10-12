import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlanRecord, PlanSummary, PlanTodoItem } from '@ciro-code/harness-shared';
import { plansDir as workspacePlansDir } from '../paths/product-paths.js';

export interface PlanStoreOptions {
  /** sessions 根目录（~/.ciro/sessions） */
  sessionsRoot: string;
}

/** Cursor 式：`标题_aaaaaaaa.plan.md` */
const PLAN_FILE_EXT = '.plan.md';

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/** 标题 → 文件名安全段（保留中文；空白改 `_`） */
export function titleSlug(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 80) || '计划';
}

export function planFileName(title: string, planId: string): string {
  return `${titleSlug(title)}_${planId}${PLAN_FILE_EXT}`;
}

/** 从文件名解析 planId；兼容旧版 `{planId}.md` */
export function planIdFromFileName(name: string): string | undefined {
  if (name.endsWith(PLAN_FILE_EXT)) {
    const stem = name.slice(0, -PLAN_FILE_EXT.length);
    const m = stem.match(/_([a-f0-9]{8})$/i);
    return m?.[1];
  }
  if (name.endsWith('.md')) return name.slice(0, -3);
  return undefined;
}

function parseFrontMatter(raw: string): {
  title: string;
  todos: PlanTodoItem[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  body: string;
} {
  const now = Date.now();
  if (!raw.startsWith('---\n')) {
    return { title: 'Plan', todos: [], createdAt: now, updatedAt: now, body: raw.trim() };
  }
  const end = raw.indexOf('\n---\n', 4);
  if (end < 0) {
    return { title: 'Plan', todos: [], createdAt: now, updatedAt: now, body: raw.trim() };
  }
  const fm = raw.slice(4, end);
  const body = raw.slice(end + 5).trim();
  let title = 'Plan';
  let createdAt = now;
  let updatedAt = now;
  let confirmedAt: number | undefined;
  let todos: PlanTodoItem[] = [];
  for (const line of fm.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'title') title = value.replace(/^["']|["']$/g, '');
    if (key === 'createdAt') createdAt = Number(value) || now;
    if (key === 'updatedAt') updatedAt = Number(value) || now;
    if (key === 'confirmedAt' && value) confirmedAt = Number(value) || undefined;
    if (key === 'todos') {
      try {
        todos = JSON.parse(value) as PlanTodoItem[];
      } catch {
        todos = [];
      }
    }
  }
  return { title, todos, createdAt, updatedAt, confirmedAt, body };
}

function serializePlan(record: PlanRecord): string {
  const todosJson = JSON.stringify(record.todos);
  const lines = [
    '---',
    `title: ${JSON.stringify(record.title)}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
  ];
  if (record.confirmedAt) lines.push(`confirmedAt: ${record.confirmedAt}`);
  lines.push(`todos: ${todosJson}`);
  lines.push('---', '', record.markdown.trim(), '');
  return lines.join('\n');
}

/** Session 级计划落盘：`sessions/{id}/plans/{标题}_{planId}.plan.md` */
export class PlanStore {
  readonly sessionsRoot: string;

  constructor(opts: PlanStoreOptions) {
    this.sessionsRoot = opts.sessionsRoot;
  }

  plansDir(sessionId: string): string {
    return join(this.sessionsRoot, sessionId, 'plans');
  }

  /** 解析已有文件路径（含旧 `{planId}.md`） */
  private resolvePlanPath(sessionId: string, planId: string): string | undefined {
    const dir = this.plansDir(sessionId);
    if (!existsSync(dir)) return undefined;
    const legacy = join(dir, `${planId}.md`);
    if (existsSync(legacy)) return legacy;
    const suffix = `_${planId}${PLAN_FILE_EXT}`;
    for (const name of readdirSync(dir)) {
      if (name.endsWith(suffix)) return join(dir, name);
    }
    return undefined;
  }

  list(sessionId: string): PlanSummary[] {
    const dir = this.plansDir(sessionId);
    if (!existsSync(dir)) return [];
    const out: PlanSummary[] = [];
    const seen = new Set<string>();
    for (const name of readdirSync(dir)) {
      const planId = planIdFromFileName(name);
      if (!planId || seen.has(planId)) continue;
      seen.add(planId);
      const rec = this.read(sessionId, planId);
      if (rec) {
        out.push({
          planId: rec.planId,
          title: rec.title,
          updatedAt: rec.updatedAt,
          confirmed: Boolean(rec.confirmedAt),
        });
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  read(sessionId: string, planId: string): PlanRecord | undefined {
    const path = this.resolvePlanPath(sessionId, planId);
    if (!path) return undefined;
    const raw = readFileSync(path, 'utf-8');
    const parsed = parseFrontMatter(raw);
    return {
      planId,
      title: parsed.title,
      markdown: parsed.body,
      todos: parsed.todos,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      confirmedAt: parsed.confirmedAt,
    };
  }

  create(
    sessionId: string,
    input: { title?: string; markdown: string; todos?: PlanTodoItem[]; planId?: string },
  ): PlanRecord {
    const planId = input.planId?.trim() || shortId();
    const now = Date.now();
    const record: PlanRecord = {
      planId,
      title: input.title?.trim() || 'Plan',
      markdown: input.markdown,
      todos: input.todos ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.writeRecord(sessionId, record);
    return record;
  }

  update(
    sessionId: string,
    planId: string,
    input: { title?: string; markdown?: string; todos?: PlanTodoItem[] },
  ): PlanRecord {
    const existing = this.read(sessionId, planId);
    if (!existing) throw new Error(`Plan not found: ${planId}`);
    const record: PlanRecord = {
      ...existing,
      title: input.title?.trim() || existing.title,
      markdown: input.markdown ?? existing.markdown,
      todos: input.todos ?? existing.todos,
      updatedAt: Date.now(),
    };
    this.writeRecord(sessionId, record);
    return record;
  }

  markConfirmed(sessionId: string, planId: string): PlanRecord {
    const existing = this.read(sessionId, planId);
    if (!existing) throw new Error(`Plan not found: ${planId}`);
    const record: PlanRecord = {
      ...existing,
      confirmedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.writeRecord(sessionId, record);
    return record;
  }

  /**
   * 将 session 计划复制到工作区 `.ciro/plans/{标题}_{planId}.plan.md`
   */
  saveToWorkspace(
    sessionId: string,
    planId: string,
    workspace: string,
  ): { pathRel: string; absolutePath: string; plan: PlanRecord } {
    const plan = this.read(sessionId, planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    const fileName = planFileName(plan.title, plan.planId);
    const pathRel = join('.ciro', 'plans', fileName).replace(/\\/g, '/');
    const absolutePath = join(workspacePlansDir(workspace), fileName);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, serializePlan(plan), 'utf-8');
    return { pathRel, absolutePath, plan };
  }

  private writeRecord(sessionId: string, record: PlanRecord): void {
    const dir = this.plansDir(sessionId);
    mkdirSync(dir, { recursive: true });
    const nextPath = join(dir, planFileName(record.title, record.planId));
    const prevPath = this.resolvePlanPath(sessionId, record.planId);
    writeFileSync(nextPath, serializePlan(record), 'utf-8');
    if (prevPath && prevPath !== nextPath && existsSync(prevPath)) {
      unlinkSync(prevPath);
    }
  }
}
