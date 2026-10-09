import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuditEntry, PolicyDecision } from '@ciro/harness-shared';
import {
  auditDbPath,
  legacyAuditDbPath,
  legacyPathWarning,
  resolveReadable,
} from '../paths/product-paths.js';

export function defaultAuditDbPath(): string {
  const resolved = resolveReadable(auditDbPath(), legacyAuditDbPath());
  if (resolved.fromLegacy) {
    console.warn(`[ciro] ${legacyPathWarning('audit.db', legacyAuditDbPath())}`);
  }
  return resolved.path;
}

export class AuditLog {
  private readonly db: DatabaseSync;

  constructor(dbPath: string = defaultAuditDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        tool TEXT NOT NULL,
        source TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        target_summary TEXT,
        user_override INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_entries(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_entries(timestamp);
    `);
  }

  append(entry: Omit<AuditEntry, 'id'>): AuditEntry {
    const stmt = this.db.prepare(`
      INSERT INTO audit_entries
        (timestamp, session_id, mode, tool, source, decision, reason, target_summary, user_override)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.timestamp,
      entry.sessionId,
      entry.mode,
      entry.tool,
      entry.source,
      entry.decision,
      entry.reason,
      entry.targetSummary ?? null,
      entry.userOverride ? 1 : 0,
    );
    return { ...entry, id: Number(result.lastInsertRowid) };
  }

  list(opts: { sessionId?: string; limit?: number } = {}): AuditEntry[] {
    const limit = opts.limit ?? 100;
    let rows: Record<string, unknown>[];
    if (opts.sessionId) {
      rows = this.db
        .prepare(
          `SELECT * FROM audit_entries WHERE session_id = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(opts.sessionId, limit) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare(`SELECT * FROM audit_entries ORDER BY id DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[];
    }
    return rows.map((r) => ({
      id: Number(r.id),
      timestamp: String(r.timestamp),
      sessionId: String(r.session_id),
      mode: String(r.mode),
      tool: String(r.tool),
      source: r.source as AuditEntry['source'],
      decision: r.decision as PolicyDecision,
      reason: String(r.reason),
      targetSummary: r.target_summary != null ? String(r.target_summary) : undefined,
      userOverride: Boolean(r.user_override),
    }));
  }

  close(): void {
    this.db.close();
  }
}
