import * as SQLite from 'expo-sqlite';
import type { SqlitePort, SqliteValue } from './sqliteReportRepository';

type NativeSqliteConnection = {
  runAsync(sql: string, params: readonly SqliteValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: readonly string[]): Promise<T[]>;
  withExclusiveTransactionAsync(
    action: (transaction: NativeSqliteConnection) => Promise<void>,
  ): Promise<void>;
};

function adapt(connection: NativeSqliteConnection): SqlitePort {
  return {
    async transaction(action) {
      await connection.withExclusiveTransactionAsync(async (transaction) => action(adapt(transaction)));
    },
    async execute(sql: string, params: readonly SqliteValue[] = []) {
      await connection.runAsync(sql, params);
    },
    async query<T>(sql: string, params: readonly string[] = []) {
      return connection.getAllAsync<T>(sql, params);
    },
  };
}

export async function openExpoSqlitePort(): Promise<SqlitePort> {
  const database = await SQLite.openDatabaseAsync('convoautopsy.db');
  return adapt(database as unknown as NativeSqliteConnection);
}
