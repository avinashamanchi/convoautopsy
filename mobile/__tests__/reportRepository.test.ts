import { DatabaseSync } from 'node:sqlite';
import { createSqlitePreferenceStore } from '../src/services/sqlitePreferenceStore';
import { createSqliteReportRepository, normalizeTitleSearch, type SqlitePort, type SqliteValue } from '../src/services/sqliteReportRepository';
import { openExpoSqlitePort } from '../src/services/expoSqlitePort';
import type { SavedReport } from '../src/services/reportRepository';

const validResult = {
  schemaVersion: 1 as const,
  mode: 'local' as const,
  intensityScore: 42,
  conflictMode: 'Collaborating' as const,
  messages: [{
    sender: 'Person A',
    text: 'Can we talk?',
    pattern: 'Neutral' as const,
    egoState: 'Adult' as const,
    possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
  }],
};

function savedReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    id: 'report-1',
    title: 'Friday conversation',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    sourceText: null,
    result: validResult,
    responseDrafts: [],
    ...overrides,
  };
}

class RealSqlitePort implements SqlitePort {
  readonly database = new DatabaseSync(':memory:');
  readonly reads: Array<{ sql: string; params: readonly SqliteValue[] }> = [];
  readonly writes: Array<{ sql: string; params: readonly SqliteValue[] }> = [];

  async transaction<T>(action: (transaction: SqlitePort) => Promise<T>): Promise<T> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const value = await action(this);
      this.database.exec('COMMIT');
      return value;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async execute(sql: string, params: readonly SqliteValue[] = []): Promise<void> {
    this.writes.push({ sql, params });
    this.database.prepare(sql).run(...params);
  }

  async query<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
    this.reads.push({ sql, params });
    return this.database.prepare(sql).all(...params) as T[];
  }

  clearTrace() {
    this.reads.splice(0, this.reads.length);
    this.writes.splice(0, this.writes.length);
  }

  close() { this.database.close(); }
}

class OneShotMigrationFailurePort implements SqlitePort {
  private shouldFail = true;
  constructor(readonly real: RealSqlitePort) {}

  transaction<T>(action: (transaction: SqlitePort) => Promise<T>): Promise<T> {
    return this.real.transaction(() => action(this));
  }

  async execute(sql: string, params: readonly SqliteValue[] = []): Promise<void> {
    if (this.shouldFail && sql.includes('reports_updated_id_idx')) {
      this.shouldFail = false;
      throw new Error('simulated migration failure');
    }
    await this.real.execute(sql, params);
  }

  query<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
    return this.real.query<T>(sql, params);
  }
}

const ports: RealSqlitePort[] = [];
function realPort() {
  const port = new RealSqlitePort();
  ports.push(port);
  return port;
}

afterEach(() => {
  for (const port of ports.splice(0, ports.length)) port.close();
});

describe('SQLite report repository migrations', () => {
  it('returns a transaction action result even when the native Expo API returns void', async () => {
    const port = await openExpoSqlitePort();
    await expect(port.transaction(async () => 42)).resolves.toBe(42);
  });

  it('applies v1 and v2 as separate transactions from a new database', async () => {
    const db = realPort();
    await createSqliteReportRepository(db).initialize();

    expect(db.database.prepare('PRAGMA user_version').get()).toEqual(expect.objectContaining({ user_version: 2 }));
    const indexes = db.database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => String(row.name));
    expect(indexes).toEqual(expect.arrayContaining([
      'reports_updated_id_idx', 'reports_title_nocase_idx', 'reports_search_title_idx', 'reports_created_at_idx',
    ]));
    expect(db.writes.findIndex(({ sql }) => sql === 'PRAGMA user_version = 1'))
      .toBeLessThan(db.writes.findIndex(({ sql }) => sql.includes('ALTER TABLE reports')));
    expect(db.writes.at(-1)?.sql).toBe('PRAGMA user_version = 2');
  });

  it('upgrades v1 rows with Unicode-preserving normalized search titles', async () => {
    const db = realPort();
    db.database.exec(`CREATE TABLE reports (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      source_text TEXT, result_json TEXT NOT NULL, response_drafts_json TEXT NOT NULL DEFAULT '[]'
    ); CREATE TABLE preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 1;`);
    db.database.prepare(`INSERT INTO reports
      (id, title, created_at, updated_at, source_text, result_json, response_drafts_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('accent', 'CAFÉ notes', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', null, JSON.stringify(validResult), '[]');

    const repository = createSqliteReportRepository(db);
    await repository.initialize();

    await expect(repository.listPage({ query: 'café' })).resolves.toMatchObject({ items: [{ id: 'accent' }] });
    expect(db.database.prepare('SELECT search_title FROM reports WHERE id = ?').get('accent'))
      .toEqual(expect.objectContaining({ search_title: normalizeTitleSearch('CAFÉ notes') }));
  });

  it('is idempotent at v2 and performs no DDL writes', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    db.clearTrace();

    await repository.initialize();

    expect(db.writes).toEqual([]);
    expect(db.reads.map(({ sql }) => sql)).toEqual(['PRAGMA user_version']);
  });

  it('rejects a future schema before issuing any writes', async () => {
    const db = realPort();
    db.database.exec('PRAGMA user_version = 3');

    await expect(createSqliteReportRepository(db).initialize()).rejects.toThrow('UNSUPPORTED_REPORT_SCHEMA');
    expect(db.writes).toEqual([]);
  });

  it('rolls a failed migration back and can retry it', async () => {
    const db = realPort();
    db.database.exec(`CREATE TABLE reports (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      source_text TEXT, result_json TEXT NOT NULL, response_drafts_json TEXT NOT NULL DEFAULT '[]'
    ); CREATE TABLE preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version = 1;`);
    const repository = createSqliteReportRepository(new OneShotMigrationFailurePort(db));

    await expect(repository.initialize()).rejects.toThrow('simulated migration failure');
    expect(db.database.prepare('PRAGMA user_version').get()).toEqual(expect.objectContaining({ user_version: 1 }));
    expect(db.database.prepare('PRAGMA table_info(reports)').all().map((row) => row.name)).not.toContain('search_title');

    await expect(repository.initialize()).resolves.toBeUndefined();
    expect(db.database.prepare('PRAGMA user_version').get()).toEqual(expect.objectContaining({ user_version: 2 }));
  });
});

describe('SQLite report repository paging', () => {
  it('uses stable updatedAt and id keyset pagination without duplicates', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    await repository.save(savedReport({ id: 'a', updatedAt: '2026-08-01T10:00:00.000Z' }));
    await repository.save(savedReport({ id: 'b', updatedAt: '2026-08-02T10:00:00.000Z' }));
    await repository.save(savedReport({ id: 'c', updatedAt: '2026-08-02T10:00:00.000Z' }));

    const first = await repository.listPage({ limit: 2 });
    const second = await repository.listPage({ limit: 2, cursor: first.nextCursor! });

    expect(first.items.map((item) => item.id)).toEqual(['c', 'b']);
    expect(second.items.map((item) => item.id)).toEqual(['a']);
    expect(db.reads.at(-1)?.sql).toContain('((updated_at < ?) OR (updated_at = ? AND id < ?))');
  });

  it('clamps pages to 50, fetches one lookahead row, and projects no private payload columns', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    db.clearTrace();

    await repository.listPage({ limit: 500 });

    const query = db.reads.at(-1)!;
    expect(query.params.at(-1)).toBe(51);
    expect(query.sql).toContain('SELECT id, title, created_at, updated_at');
    expect(query.sql).not.toContain('source_text');
    expect(query.sql).not.toContain('result_json');
    expect(query.sql).not.toContain('SELECT *');
  });

  it('escapes wildcard punctuation and preserves Unicode case folding', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    for (const report of [
      savedReport({ id: 'percent', title: '100% ready' }),
      savedReport({ id: 'underscore', title: 'follow_up' }),
      savedReport({ id: 'slash', title: 'Folder \\ archive' }),
      savedReport({ id: 'accent', title: 'CAFÉ notes' }),
      savedReport({ id: 'near-match', title: '100x ready' }),
    ]) await repository.save(report);

    await expect(repository.listPage({ query: '%' })).resolves.toMatchObject({ items: [{ id: 'percent' }] });
    await expect(repository.listPage({ query: '_' })).resolves.toMatchObject({ items: [{ id: 'underscore' }] });
    await expect(repository.listPage({ query: '\\' })).resolves.toMatchObject({ items: [{ id: 'slash' }] });
    await expect(repository.listPage({ query: 'café' })).resolves.toMatchObject({ items: [{ id: 'accent' }] });
    const search = db.reads.findLast(({ sql }) => sql.includes('search_title LIKE'))!;
    expect(search.sql).toContain("LIKE ? ESCAPE '\\' COLLATE NOCASE");
  });

  it('traverses a tie-heavy 10,000-row fixture with no gaps, duplicates, or page above 50', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    const statement = db.database.prepare(`INSERT INTO reports
      (id, title, search_title, created_at, updated_at, source_text, result_json, response_drafts_json)
      VALUES (?, ?, ?, ?, ?, NULL, ?, '[]')`);
    db.database.exec('BEGIN');
    for (let index = 0; index < 10_000; index += 1) {
      const id = `report-${String(index).padStart(5, '0')}`;
      const updatedAt = `2026-08-${String((index % 5) + 1).padStart(2, '0')}T00:00:00.000Z`;
      statement.run(id, `Report ${index}`, `report ${index}`, updatedAt, updatedAt, JSON.stringify(validResult));
    }
    db.database.exec('COMMIT');

    const ids = new Set<string>();
    let cursor = undefined;
    do {
      const page = await repository.listPage({ cursor, limit: 50 });
      expect(page.items.length).toBeLessThanOrEqual(50);
      for (const item of page.items) expect(ids.has(item.id)).toBe(false);
      for (const item of page.items) ids.add(item.id);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(ids.size).toBe(10_000);
    expect(db.reads.filter(({ sql }) => sql.includes('FROM reports') && sql.includes('ORDER BY')).every(({ sql }) => sql.includes('LIMIT ?'))).toBe(true);
  }, 30_000);
});

describe('SQLite report repository reports and trends', () => {
  it('saves, counts, reads, deletes, and rejects corrupt full reports', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    await repository.save(savedReport());
    await expect(repository.count()).resolves.toBe(1);
    await expect(repository.get('report-1')).resolves.toMatchObject({ id: 'report-1', result: validResult });
    db.database.prepare('UPDATE reports SET result_json = ? WHERE id = ?').run('{', 'report-1');
    await expect(repository.get('report-1')).rejects.toThrow('CORRUPT_REPORT');
    await repository.delete('report-1');
    await expect(repository.count()).resolves.toBe(0);
  });

  it('summarizes valid result fields in one consistent read without selecting private text', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    await repository.save(savedReport({ sourceText: 'private transcript' }));
    await repository.save(savedReport({
      id: 'report-2',
      createdAt: '2026-08-02T10:00:00.000Z',
      result: { ...validResult, intensityScore: 28, messages: [...validResult.messages, { ...validResult.messages[0], sender: 'Person B' }] },
    }));
    await repository.save(savedReport({ id: 'outside', createdAt: '2026-09-01T00:00:00.000Z' }));
    db.clearTrace();

    await expect(repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).resolves.toEqual({
      reportCount: 2,
      averageIntensity: 35,
      conflictModes: { Collaborating: 2 },
      patterns: { Neutral: 3 },
    });
    expect(db.reads.every(({ sql }) => !sql.toLocaleLowerCase().includes('source_text'))).toBe(true);
    expect(db.reads.every(({ sql }) => !/select\s+result_json/i.test(sql))).toBe(true);
  });

  it('returns an explicit empty summary and validates the half-open window', async () => {
    const repository = createSqliteReportRepository(realPort());
    await repository.initialize();
    await expect(repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).resolves.toEqual({
      reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {},
    });
    await expect(repository.getTrendSummary('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow('INVALID_TREND_WINDOW');
    await expect(repository.getTrendSummary('invalid', '2026-09-01T00:00:00.000Z')).rejects.toThrow('INVALID_TREND_WINDOW');
  });

  it('fails closed for malformed or invalid stored trend fields', async () => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    await repository.save(savedReport());
    db.database.prepare('UPDATE reports SET result_json = ? WHERE id = ?').run('{', 'report-1');
    await expect(repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow('CORRUPT_REPORT');
    db.database.prepare('UPDATE reports SET result_json = ? WHERE id = ?').run(JSON.stringify({ ...validResult, conflictMode: 'Invented' }), 'report-1');
    await expect(repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow('CORRUPT_REPORT');
  });

  it.each([
    ['missing intensity', { ...validResult, intensityScore: undefined }],
    ['missing conflict mode', { ...validResult, conflictMode: undefined }],
    ['missing messages', { ...validResult, messages: undefined }],
    ['non-array messages', { ...validResult, messages: 'not-an-array' }],
    ['missing message pattern', { ...validResult, messages: [{ ...validResult.messages[0], pattern: undefined }] }],
    ['a scalar message entry', { ...validResult, messages: ['not-an-object'] }],
  ])('fails closed for %s without unsafe json_each evaluation', async (_name, payload) => {
    const db = realPort();
    const repository = createSqliteReportRepository(db);
    await repository.initialize();
    await repository.save(savedReport());
    db.database.prepare('UPDATE reports SET result_json = ? WHERE id = ?').run(JSON.stringify(payload), 'report-1');

    await expect(repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).rejects.toThrow('CORRUPT_REPORT');
  });
});

describe('SQLite preference store', () => {
  it('sets, reads, deletes, and clears preferences', async () => {
    const db = realPort();
    await createSqliteReportRepository(db).initialize();
    const preferences = createSqlitePreferenceStore(db);
    await preferences.set('retain-source-text', 'true');
    await expect(preferences.get('retain-source-text')).resolves.toBe('true');
    await preferences.delete('retain-source-text');
    await expect(preferences.get('retain-source-text')).resolves.toBeNull();
    await preferences.set('one', '1');
    await preferences.set('two', '2');
    await preferences.deleteAll();
    await expect(preferences.get('one')).resolves.toBeNull();
    await expect(preferences.get('two')).resolves.toBeNull();
  });
});
