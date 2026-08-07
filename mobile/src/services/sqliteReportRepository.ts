import { AnalysisResultSchema, ResponseDraftSchema } from '../domain/analysis';
import { assertTrendWindow, parseTrendSummary, type TrendAggregateRow, type TrendCountRow } from '../domain/trends';
import type {
  ReportPage,
  ReportRepository,
  SavedReport,
  SavedReportListItem,
  TrendSummary,
} from './reportRepository';

export type SqliteValue = string | number | null;

export interface SqlitePort {
  transaction<T>(action: (transaction: SqlitePort) => Promise<T>): Promise<T>;
  execute(sql: string, params?: readonly SqliteValue[]): Promise<void>;
  query<T>(sql: string, params?: readonly SqliteValue[]): Promise<T[]>;
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

type ReportListRow = Pick<ReportRow, 'id' | 'title' | 'created_at' | 'updated_at'>;
type UserVersionRow = { user_version: number };

const CURRENT_SCHEMA_VERSION = 2;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

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
] as const;

const migrationV2BeforeBackfill = [
  "ALTER TABLE reports ADD COLUMN search_title TEXT NOT NULL DEFAULT ''",
] as const;

const migrationV2AfterBackfill = [
  'CREATE INDEX IF NOT EXISTS reports_updated_id_idx ON reports(updated_at DESC, id DESC)',
  'CREATE INDEX IF NOT EXISTS reports_title_nocase_idx ON reports(title COLLATE NOCASE)',
  'CREATE INDEX IF NOT EXISTS reports_search_title_idx ON reports(search_title COLLATE NOCASE)',
  'CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at)',
] as const;

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

function parseListItem(row: ReportListRow): SavedReportListItem {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function normalizeTitleSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

async function readSchemaVersion(db: SqlitePort): Promise<number> {
  const rows = await db.query<UserVersionRow>('PRAGMA user_version');
  const version = Number(rows[0]?.user_version ?? 0);
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_SCHEMA_VERSION) {
    throw new Error('UNSUPPORTED_REPORT_SCHEMA');
  }
  return version;
}

async function migrateToV1(db: SqlitePort): Promise<void> {
  await db.transaction(async (transaction) => {
    for (const statement of migrationV1) await transaction.execute(statement);
    await transaction.execute('PRAGMA user_version = 1');
  });
}

async function migrateToV2(db: SqlitePort): Promise<void> {
  await db.transaction(async (transaction) => {
    for (const statement of migrationV2BeforeBackfill) await transaction.execute(statement);
    const titles = await transaction.query<{ id: string; title: string }>('SELECT id, title FROM reports');
    for (const row of titles) {
      await transaction.execute('UPDATE reports SET search_title = ? WHERE id = ?', [normalizeTitleSearch(row.title), row.id]);
    }
    for (const statement of migrationV2AfterBackfill) await transaction.execute(statement);
    await transaction.execute('PRAGMA user_version = 2');
  });
}

const invalidTrendJsonSql = `SELECT COUNT(*) AS invalid_count
  FROM reports
  WHERE created_at >= ? AND created_at < ? AND json_valid(result_json) = 0`;

const invalidTrendFieldsSql = `SELECT COUNT(*) AS invalid_count
  FROM reports
  WHERE created_at >= ? AND created_at < ? AND (
    json_type(result_json, '$.intensityScore') IS NOT 'integer'
    OR json_extract(result_json, '$.intensityScore') < 0
    OR json_extract(result_json, '$.intensityScore') > 100
    OR json_extract(result_json, '$.conflictMode') IS NULL
    OR json_extract(result_json, '$.conflictMode') NOT IN ('Competing', 'Avoiding', 'Compromising', 'Collaborating', 'Accommodating', 'Competing vs Avoiding')
    OR json_type(result_json, '$.messages') IS NOT 'array'
    OR json_array_length(result_json, '$.messages') < 1
    OR json_array_length(result_json, '$.messages') > 100
    OR EXISTS (
      SELECT 1 FROM json_each(
        CASE WHEN json_type(reports.result_json, '$.messages') = 'array'
          THEN json_extract(reports.result_json, '$.messages') ELSE json('[]') END
      ) AS message
      WHERE CASE
        WHEN message.type != 'object' THEN 1
        WHEN json_extract(message.value, '$.pattern') IS NULL THEN 1
        WHEN json_extract(message.value, '$.pattern') NOT IN ('Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral') THEN 1
        ELSE 0
      END = 1
    )
  )`;

export function createSqliteReportRepository(db: SqlitePort): ReportRepository {
  return {
    async initialize() {
      const version = await readSchemaVersion(db);
      if (version < 1) await migrateToV1(db);
      if (version < 2) await migrateToV2(db);
    },
    async listPage(request = {}): Promise<ReportPage> {
      const limit = clampLimit(request.limit);
      const clauses: string[] = [];
      const params: SqliteValue[] = [];
      const normalizedQuery = request.query?.trim();
      if (normalizedQuery) {
        // This is intentional contains-search behavior. The leading wildcard can require a SQLite
        // index scan, while LIMIT still bounds every materialized result page to 51 lightweight rows.
        clauses.push("search_title LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(`%${escapeLike(normalizeTitleSearch(normalizedQuery))}%`);
      }
      if (request.cursor) {
        clauses.push('((updated_at < ?) OR (updated_at = ? AND id < ?))');
        params.push(request.cursor.updatedAt, request.cursor.updatedAt, request.cursor.id);
      }
      params.push(limit + 1);
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const rows = await db.query<ReportListRow>(
        `SELECT id, title, created_at, updated_at FROM reports${where} ORDER BY updated_at DESC, id DESC LIMIT ?`,
        params,
      );
      const items = rows.slice(0, limit).map(parseListItem);
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
      };
    },
    async count() {
      const rows = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM reports');
      const count = Number(rows[0]?.count ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('CORRUPT_REPORT_COUNT');
      return count;
    },
    async getTrendSummary(fromInclusive, toExclusive): Promise<TrendSummary> {
      assertTrendWindow(fromInclusive, toExclusive);
      return db.transaction(async (transaction) => {
        const params = [fromInclusive, toExclusive] as const;
        const malformed = await transaction.query<{ invalid_count: number }>(invalidTrendJsonSql, params);
        if (Number(malformed[0]?.invalid_count ?? 0) > 0) throw new Error('CORRUPT_REPORT');
        const invalidFields = await transaction.query<{ invalid_count: number }>(invalidTrendFieldsSql, params);
        if (Number(invalidFields[0]?.invalid_count ?? 0) > 0) throw new Error('CORRUPT_REPORT');
        const aggregate = await transaction.query<TrendAggregateRow>(
          `SELECT COUNT(*) AS report_count,
             ROUND(AVG(json_extract(result_json, '$.intensityScore'))) AS average_intensity
           FROM reports WHERE created_at >= ? AND created_at < ?`,
          params,
        );
        const conflicts = await transaction.query<TrendCountRow>(
          `SELECT json_extract(result_json, '$.conflictMode') AS label, COUNT(*) AS count
           FROM reports WHERE created_at >= ? AND created_at < ?
           GROUP BY label ORDER BY label`,
          params,
        );
        const patterns = await transaction.query<TrendCountRow>(
          `SELECT json_extract(message.value, '$.pattern') AS label, COUNT(*) AS count
           FROM reports JOIN json_each(reports.result_json, '$.messages') AS message
           WHERE reports.created_at >= ? AND reports.created_at < ?
           GROUP BY label ORDER BY label`,
          params,
        );
        return parseTrendSummary(aggregate[0] ?? { report_count: 0, average_intensity: null }, conflicts, patterns);
      });
    },
    async get(id) {
      const rows = await db.query<ReportRow>('SELECT * FROM reports WHERE id = ?', [id]);
      return rows.length === 0 ? null : parseSavedReport(rows[0]);
    },
    async save(report) {
      await db.execute(
        `INSERT INTO reports (id, title, search_title, created_at, updated_at, source_text, result_json, response_drafts_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           search_title = excluded.search_title,
           updated_at = excluded.updated_at,
           source_text = excluded.source_text,
           result_json = excluded.result_json,
           response_drafts_json = excluded.response_drafts_json`,
        [
          report.id,
          report.title,
          normalizeTitleSearch(report.title),
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
