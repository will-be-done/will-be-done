import { describe, expect, test } from "bun:test";
import type { Connection } from "@tursodatabase/serverless";
import {
  buildTursoDatabaseName,
  RotatingTursoAsyncSQLiteDB,
  type TursoDriverDependencies,
} from "./turso";

class FakeConnection {
  inTransaction = false;
  closed = false;
  reconnectCount = 0;
  readonly statements: string[] = [];

  async exec(sql: string): Promise<void> {
    this.statements.push(sql);
    if (/^BEGIN\b/i.test(sql)) this.inTransaction = true;
    if (/^(COMMIT|ROLLBACK)\b/i.test(sql)) this.inTransaction = false;
  }

  async prepare(): Promise<never> {
    throw new Error("prepare is not used by these tests");
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async reconnect(): Promise<void> {
    this.reconnectCount += 1;
    this.closed = false;
    this.inTransaction = false;
  }

  asConnection(): Connection {
    return this as unknown as Connection;
  }
}

describe("Turso database names", () => {
  test("uses a stable main database name", () => {
    expect(buildTursoDatabaseName("My App", "main", "main")).toBe(
      "my-app-main",
    );
  });

  test("creates distinct names for IDs that sanitize the same way", () => {
    const underscore = buildTursoDatabaseName("wbd", "space", "a_b");
    const dash = buildTursoDatabaseName("wbd", "space", "a-b");

    expect(underscore).not.toBe(dash);
  });

  test("keeps long names within the Turso limit", () => {
    const name = buildTursoDatabaseName(
      "a-very-long-will-be-done-deployment-prefix",
      "user",
      "an-even-longer-user-identifier-that-cannot-fit-in-a-database-name",
    );

    expect(name.length).toBeLessThanOrEqual(56);
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });

  test("keeps UUID-based space names within the Turso limit", () => {
    const name = buildTursoDatabaseName(
      "wbd-local-quolpr",
      "space",
      "0198b10a-b15e-7e6a-b426-c491007f4b65",
    );

    expect(name.length).toBeLessThanOrEqual(56);
    expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(name).toContain("-space-");
  });

  test("keeps the main database name within the Turso limit", () => {
    const name = buildTursoDatabaseName("a".repeat(100), "main", "main");

    expect(name).toHaveLength(56);
    expect(name).toEndWith("-main");
  });
});

describe("Turso database credentials", () => {
  test("refreshes with a token scoped to the same database", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const replacements: Array<{
      connection: FakeConnection;
      token: string;
      url: string;
    }> = [];
    const tokenDatabaseNames: string[] = [];
    const dependencies: TursoDriverDependencies = {
      createToken: async (databaseName) => {
        tokenDatabaseNames.push(databaseName);
        return `token-${tokenDatabaseNames.length}`;
      },
      connect: (url, token) => {
        const connection = new FakeConnection();
        replacements.push({ connection, token, url });
        return connection.asConnection();
      },
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new RotatingTursoAsyncSQLiteDB(
      "libsql://user-db.turso.io",
      "wbd-user-123",
      dependencies,
      initial.asConnection(),
    );

    await db.exec("SELECT before_refresh");
    now = 11;
    await db.exec("SELECT after_refresh");

    expect(tokenDatabaseNames).toEqual(["wbd-user-123"]);
    expect(replacements).toHaveLength(1);
    expect(replacements[0]?.token).toBe("token-1");
    expect(replacements[0]?.url).toBe("libsql://user-db.turso.io");
    expect(replacements[0]?.connection.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_refresh",
    ]);
    expect(initial.closed).toBe(true);

    await db.close();
  });

  test("does not replace a connection in the middle of a transaction", async () => {
    let now = 0;
    let tokenCount = 0;
    const initial = new FakeConnection();
    const dependencies: TursoDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => new FakeConnection().asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new RotatingTursoAsyncSQLiteDB(
      "libsql://space-db.turso.io",
      "wbd-space-123",
      dependencies,
      initial.asConnection(),
    );

    await db.exec("BEGIN TRANSACTION");
    now = 11;
    await db.exec("SELECT inside_transaction");
    await db.exec("COMMIT");
    expect(tokenCount).toBe(0);
    expect(initial.closed).toBe(false);

    await db.exec("SELECT after_transaction");
    expect(tokenCount).toBe(1);
    expect(initial.closed).toBe(true);

    await db.close();
  });

  test("reconnects and retries when an idle server session expires", async () => {
    const connection = new FakeConnection();
    let shouldExpire = true;
    const originalExec = connection.exec.bind(connection);
    connection.exec = async (sql: string) => {
      connection.statements.push(sql);
      if (shouldExpire) {
        shouldExpire = false;
        throw new Error("HTTP error! status: 404");
      }
      if (/^BEGIN\b/i.test(sql)) connection.inTransaction = true;
      if (/^(COMMIT|ROLLBACK)\b/i.test(sql)) connection.inTransaction = false;
    };

    const dependencies: TursoDriverDependencies = {
      createToken: async () => "unused",
      connect: () => connection.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new RotatingTursoAsyncSQLiteDB(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      connection.asConnection(),
    );

    await db.exec("BEGIN TRANSACTION");

    expect(connection.reconnectCount).toBe(1);
    expect(connection.statements).toEqual([
      "BEGIN TRANSACTION",
      "PRAGMA foreign_keys = ON",
      "BEGIN TRANSACTION",
    ]);
    expect(connection.inTransaction).toBe(true);

    connection.exec = originalExec;
    await db.exec("ROLLBACK");
    await db.close();
  });

  test("does not retry a failed statement from inside a transaction", async () => {
    const connection = new FakeConnection();
    connection.inTransaction = true;
    connection.exec = async (sql: string) => {
      connection.statements.push(sql);
      throw new Error("HTTP error! status: 404");
    };
    const dependencies: TursoDriverDependencies = {
      createToken: async () => "unused",
      connect: () => connection.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new RotatingTursoAsyncSQLiteDB(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      connection.asConnection(),
    );

    expect(db.exec("SELECT inside_transaction")).rejects.toThrow(
      "HTTP error! status: 404",
    );
    expect(connection.reconnectCount).toBe(0);
    expect(connection.statements).toEqual(["SELECT inside_transaction"]);

    await db.close();
  });
});
