import type { PreferenceStore } from './reportRepository';
import type { SqlitePort } from './sqliteReportRepository';

export function createSqlitePreferenceStore(db: SqlitePort): PreferenceStore {
  return {
    async get(key) {
      const rows = await db.query<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]);
      return rows[0]?.value ?? null;
    },
    async set(key, value) {
      await db.execute(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },
    async delete(key) {
      await db.execute('DELETE FROM preferences WHERE key = ?', [key]);
    },
    async deleteAll() {
      await db.execute('DELETE FROM preferences');
    },
  };
}
