type MockConnection = {
  runAsync(): Promise<void>;
  getAllAsync<T>(): Promise<T[]>;
  withExclusiveTransactionAsync(action: (transaction: MockConnection) => Promise<void>): Promise<void>;
};

const connection: MockConnection = {
  async runAsync() {},
  async getAllAsync<T>(): Promise<T[]> { return []; },
  async withExclusiveTransactionAsync(action) {
    await action(connection);
  },
};

export async function openDatabaseAsync() {
  return connection;
}
