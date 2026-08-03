import { createSqlitePreferenceStore } from '../src/services/sqlitePreferenceStore';
import { createSqliteReportRepository, type SqlitePort } from '../src/services/sqliteReportRepository';

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  source_text: string | null;
  result_json: string;
  response_drafts_json: string;
};

function sqliteAsciiLower(value: string) {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function sqliteLike(value: string, pattern: string) {
  const expression = [...pattern].map((character) => {
    if (character === '%') return '.*';
    if (character === '_') return '.';
    return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${expression}$`).test(value);
}

const validResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [{
    sender: 'Person A',
    text: 'Can we talk?',
    pattern: 'Neutral',
    egoState: 'Adult',
    possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
  }],
};

const validRow: ReportRow = {
  id: 'report-1',
  title: 'Friday conversation',
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
  source_text: null,
  result_json: JSON.stringify(validResult),
  response_drafts_json: '[]',
};

class FakeSqlitePort implements SqlitePort {
  public readonly statements: string[] = [];
  public migrationVersion = 0;
  private rows: ReportRow[];
  private preferences = new Map<string, string>();

  constructor(rows: ReportRow[] = []) {
    this.rows = [...rows];
  }

  async transaction(action: (transaction: SqlitePort) => Promise<void>): Promise<void> {
    this.statements.push('BEGIN');
    await action(this);
    this.statements.push('COMMIT');
  }

  async execute(sql: string, params: readonly (string | null)[] = []): Promise<void> {
    this.statements.push(sql);
    if (sql.startsWith('PRAGMA user_version = 1')) {
      this.migrationVersion = 1;
      return;
    }
    if (sql.startsWith('INSERT INTO reports')) {
      const [id, title, createdAt, updatedAt, sourceText, resultJson, draftsJson] = params;
      this.rows = this.rows.filter((row) => row.id !== id);
      this.rows.push({
        id: String(id), title: String(title), created_at: String(createdAt), updated_at: String(updatedAt),
        source_text: sourceText, result_json: String(resultJson), response_drafts_json: String(draftsJson),
      });
      return;
    }
    if (sql.startsWith('DELETE FROM reports WHERE id')) {
      this.rows = this.rows.filter((row) => row.id !== params[0]);
      return;
    }
    if (sql.startsWith('DELETE FROM reports')) {
      this.rows = [];
      return;
    }
    if (sql.startsWith('INSERT INTO preferences')) {
      this.preferences.set(String(params[0]), String(params[1]));
      return;
    }
    if (sql.startsWith('DELETE FROM preferences WHERE key')) {
      this.preferences.delete(String(params[0]));
      return;
    }
    if (sql.startsWith('DELETE FROM preferences')) {
      this.preferences.clear();
    }
  }

  async query<T>(sql: string, params: readonly string[] = []): Promise<T[]> {
    if (sql.includes('FROM reports')) {
      let rows = [...this.rows];
      if (sql.includes('WHERE id = ?')) rows = rows.filter((row) => row.id === params[0]);
      if (sql.includes('LOWER(title) LIKE LOWER(?)')) {
        rows = rows.filter((row) => sqliteLike(sqliteAsciiLower(row.title), sqliteAsciiLower(params[0])));
      }
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) as T[];
    }
    if (sql.includes('FROM preferences')) {
      const value = this.preferences.get(params[0]);
      return (value === undefined ? [] : [{ value }]) as T[];
    }
    return [];
  }
}

function fakeDbWithRows(rows: ReportRow[]) {
  return new FakeSqlitePort(rows);
}

describe('SQLite report repository', () => {
  it('creates version-one schema transactionally', async () => {
    const db = fakeDbWithRows([]);
    const repository = createSqliteReportRepository(db);

    await repository.initialize();

    expect(db.migrationVersion).toBe(1);
    expect(db.statements).toEqual(expect.arrayContaining([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS reports'),
      expect.stringContaining('CREATE INDEX IF NOT EXISTS reports_updated_at_idx'),
      expect.stringContaining('CREATE TABLE IF NOT EXISTS preferences'),
      'PRAGMA user_version = 1',
    ]));
    expect(db.statements.indexOf('BEGIN')).toBeLessThan(db.statements.indexOf('PRAGMA user_version = 1'));
    expect(db.statements.indexOf('COMMIT')).toBeGreaterThan(db.statements.indexOf('PRAGMA user_version = 1'));
  });

  it('does not return a row with an invalid result payload', async () => {
    const db = fakeDbWithRows([{ ...validRow, result_json: '{"intensityScore":101}' }]);
    const repository = createSqliteReportRepository(db);

    await expect(repository.list()).rejects.toThrow('CORRUPT_REPORT');
  });

  it('fails closed when result JSON is malformed in list and get', async () => {
    const repository = createSqliteReportRepository(fakeDbWithRows([{ ...validRow, result_json: '{' }]));

    await expect(repository.list()).rejects.toThrow('CORRUPT_REPORT');
    await expect(repository.get('report-1')).rejects.toThrow('CORRUPT_REPORT');
  });

  it('fails closed when response drafts JSON is malformed in list', async () => {
    const repository = createSqliteReportRepository(fakeDbWithRows([{ ...validRow, response_drafts_json: '[' }]));

    await expect(repository.list()).rejects.toThrow('CORRUPT_REPORT');
  });

  it('fails closed when response drafts do not match their schema in get', async () => {
    const repository = createSqliteReportRepository(fakeDbWithRows([{ ...validRow, response_drafts_json: '[{}]' }]));

    await expect(repository.get('report-1')).rejects.toThrow('CORRUPT_REPORT');
  });

  it('lists reports newest first and filters titles case-insensitively', async () => {
    const db = fakeDbWithRows([
      validRow,
      { ...validRow, id: 'report-2', title: 'SATURDAY check-in', updated_at: '2026-08-02T10:00:00.000Z' },
    ]);
    const repository = createSqliteReportRepository(db);

    expect((await repository.list()).map((report) => report.id)).toEqual(['report-2', 'report-1']);
    expect((await repository.list('sAtUrDaY')).map((report) => report.id)).toEqual(['report-2']);
  });

  it('searches literal punctuation and Unicode case without SQLite wildcard semantics', async () => {
    const repository = createSqliteReportRepository(fakeDbWithRows([
      { ...validRow, id: 'percent', title: '100% ready' },
      { ...validRow, id: 'underscore', title: 'follow_up' },
      { ...validRow, id: 'slash', title: 'Folder \\ archive' },
      { ...validRow, id: 'accent', title: 'CAFÉ notes' },
      { ...validRow, id: 'near-match', title: '100x ready' },
    ]));

    await expect(repository.list('%')).resolves.toMatchObject([{ id: 'percent' }]);
    await expect(repository.list('_')).resolves.toMatchObject([{ id: 'underscore' }]);
    await expect(repository.list('\\')).resolves.toMatchObject([{ id: 'slash' }]);
    await expect(repository.list('café')).resolves.toMatchObject([{ id: 'accent' }]);
  });

  it('deletes one report without deleting the others', async () => {
    const db = fakeDbWithRows([validRow, { ...validRow, id: 'report-2' }]);
    const repository = createSqliteReportRepository(db);

    await repository.delete('report-1');

    expect((await repository.list()).map((report) => report.id)).toEqual(['report-2']);
  });

  it('deletes all reports', async () => {
    const db = fakeDbWithRows([validRow]);
    const repository = createSqliteReportRepository(db);

    await repository.deleteAll();

    await expect(repository.list()).resolves.toEqual([]);
  });
});

describe('SQLite preference store', () => {
  it('sets, reads, deletes, and clears preferences', async () => {
    const preferences = createSqlitePreferenceStore(fakeDbWithRows([]));

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
