import { AnalysisResultSchema, ResponseDraftSchema } from '../domain/analysis';
import type { SavedReport, ReportRepository } from './reportRepository';

export type SqliteValue = string | null;

export interface SqlitePort {
  transaction(action: (transaction: SqlitePort) => Promise<void>): Promise<void>;
  execute(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  query<T>(sql: string, params?: readonly string[]): Promise<T[]>;
}

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source_text: string | null;
  result_json: string;
  response_drafts_json: string;
};

const migrationV1 = [
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_text TEXT,
    result_json TEXT NOT NULL,
    response_drafts_json TEXT NOT NULL DEFAULT '[]'
  )`,
  'CREATE INDEX IF NOT EXISTS reports_updated_at_idx ON reports(updated_at DESC)',
  `CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
  'PRAGMA user_version = 1',
];

function parseSavedReport(row: ReportRow): SavedReport {
  try {
    const result = AnalysisResultSchema.parse(JSON.parse(row.result_json));
    const responseDrafts = ResponseDraftSchema.array().parse(JSON.parse(row.response_drafts_json));
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceText: row.source_text,
      result,
      responseDrafts,
    };
  } catch {
    throw new Error('CORRUPT_REPORT');
  }
}

function normalizeTitleSearch(value: string) {
  return value.normalize('NFKC').toLowerCase();
}

export function createSqliteReportRepository(db: SqlitePort): ReportRepository {
  return {
    async initialize() {
      await db.transaction(async (transaction) => {
        for (const statement of migrationV1) await transaction.execute(statement);
      });
    },
    async list(query) {
      const normalizedQuery = query?.trim();
      const reports = (await db.query<ReportRow>('SELECT * FROM reports ORDER BY updated_at DESC')).map(parseSavedReport);
      if (!normalizedQuery) return reports;
      const searchTerm = normalizeTitleSearch(normalizedQuery);
      return reports.filter((report) => normalizeTitleSearch(report.title).includes(searchTerm));
    },
    async get(id) {
      const rows = await db.query<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
      return rows.length === 0 ? null : parseSavedReport(rows[0]);
    },
    async save(report) {
      await db.execute(
        `INSERT INTO reports (id, title, created_at, updated_at, source_text, result_json, response_drafts_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           source_text = excluded.source_text,
           result_json = excluded.result_json,
           response_drafts_json = excluded.response_drafts_json`,
        [
          report.id,
          report.title,
          report.createdAt,
          report.updatedAt,
          report.sourceText,
          JSON.stringify(report.result),
          JSON.stringify(report.responseDrafts),
        ],
      );
    },
    async delete(id) {
      await db.execute('DELETE FROM reports WHERE id = ?', [id]);
    },
    async deleteAll() {
      await db.execute('DELETE FROM reports');
    },
  };
}
