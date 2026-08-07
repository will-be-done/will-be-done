import { describe, expect, test } from "bun:test";
import type { Connection } from "@tursodatabase/serverless";
import {
  buildTursoDatabaseName,
  createTursoDatabaseToken,
  TursoSqlExecutor,
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

  async prepare(_sql?: string): Promise<never> {
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
  const userId = "0198b10a-b15e-7e6a-b426-c491007f4b65";
  const spaceId = "0198b10a-b15e-7e6a-b426-c491007f4b66";

  test("uses a stable main database name", () => {
    expect(buildTursoDatabaseName("My App", "main", "main")).toBe(
      "my-app-main",
    );
  });

  test("keeps the complete UUID visible in user and space database names", () => {
    expect(buildTursoDatabaseName("wbd", "user", userId)).toBe(
      `wbd-user-${userId}`,
    );
    expect(buildTursoDatabaseName("wbd", "space", spaceId)).toBe(
      `wbd-space-${spaceId}`,
    );
  });

  test("rejects a prefix that is too long for a user database name", () => {
    expect(() =>
      buildTursoDatabaseName("a".repeat(15), "user", userId),
    ).toThrow(
      "Turso database prefix is too long for user database names (maximum 14 characters)",
    );
  });

  test("accepts the longest possible prefix for a space database name", () => {
    const name = buildTursoDatabaseName(
      "wbd-local-quo",
      "space",
      spaceId,
    );

    expect(name).toBe(`wbd-local-quo-space-${spaceId}`);
    expect(name).toHaveLength(56);
  });

  test("rejects a prefix that is too long for a space database name", () => {
    expect(() =>
      buildTursoDatabaseName("wbd-local-quolpr", "space", spaceId),
    ).toThrow(
      "Turso database prefix is too long for space database names (maximum 13 characters)",
    );
  });

  test("rejects a non-UUID user or space database ID", () => {
    expect(() => buildTursoDatabaseName("wbd", "space", "not-a-uuid")).toThrow(
      "Turso space database ID must be a UUID",
    );
  });

  test("rejects a prefix that is too long for the main database name", () => {
    expect(() =>
      buildTursoDatabaseName("a".repeat(52), "main", "main"),
    ).toThrow(
      "Turso database prefix is too long for the main database (maximum 51 characters)",
    );
  });
});

describe("Turso database credentials", () => {
  test("creates a database token without requesting attach permissions", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = [];
    const token = await createTursoDatabaseToken(
      "wbd-main",
      {
        organization: "test-org",
        platformToken: "platform-token",
      },
      async (input, init) => {
        requests.push({ url: new URL(input), init });
        return Response.json({ jwt: "database-token" });
      },
    );

    expect(token).toBe("database-token");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.toString()).toBe(
      "https://api.turso.tech/v1/organizations/test-org/databases/wbd-main/auth/tokens?expiration=1h&authorization=full-access",
    );
    expect(requests[0]?.init).toEqual({
      method: "POST",
      headers: { Authorization: "Bearer platform-token" },
    });
    expect(requests[0]?.init?.body).toBeUndefined();
  });

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
    const db = new TursoSqlExecutor(
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
    const db = new TursoSqlExecutor(
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

  test("replaces an expired connection without replaying the failed query", async () => {
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      throw new Error("hrana stream expired");
    };
    const replacement = new FakeConnection();
    const tokenDatabaseNames: string[] = [];

    const dependencies: TursoDriverDependencies = {
      createToken: async (databaseName) => {
        tokenDatabaseNames.push(databaseName);
        return "fresh-token";
      },
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT do_not_replay")).rejects.toThrow(
      "hrana stream expired",
    );
    await db.exec("SELECT next_query");

    expect(tokenDatabaseNames).toEqual(["wbd-main"]);
    expect(initial.closed).toBe(true);
    expect(initial.statements).toEqual(["SELECT do_not_replay"]);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT next_query",
    ]);

    await db.close();
  });

  test("preserves an ambiguous 404 without reconnecting", async () => {
    const connection = new FakeConnection();
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
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      connection.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT missing_database")).rejects.toThrow(
      "HTTP error! status: 404",
    );
    expect(connection.reconnectCount).toBe(0);
    expect(connection.statements).toEqual(["SELECT missing_database"]);

    await db.close();
  });

  test("does not classify SQL before recovering an expired connection", async () => {
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      throw new Error("hrana stream expired");
    };
    const replacement = new FakeConnection();
    let tokenCount = 0;
    const dependencies: TursoDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("INSERT INTO tasks VALUES (1)")).rejects.toThrow(
      "hrana stream expired",
    );
    expect(tokenCount).toBe(1);
    expect(initial.statements).toEqual(["INSERT INTO tasks VALUES (1)"]);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
    ]);

    await db.close();
  });

  test("executes a prepared statement on the current rotated connection", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const replacement = new FakeConnection();
    const preparedSql: string[] = [];
    replacement.prepare = async (sql?: string) => {
      preparedSql.push(sql!);
      return {
        raw() {
          return this;
        },
        async all(values: unknown[]) {
          return [values];
        },
      } as never;
    };
    const dependencies: TursoDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    const statement = await db.prepare("SELECT ?");
    now = 11;
    expect(await statement.values(["value"])).toEqual([["value"]]);
    expect(preparedSql).toEqual(["SELECT ?"]);
    expect(initial.closed).toBe(true);

    await db.close();
  });

  test("serializes jobs and rotates the connection between jobs", async () => {
    let now = 0;
    let releaseSlowQuery = () => {};
    let markSlowQueryStarted = () => {};
    const slowQuery = new Promise<void>((resolve) => {
      releaseSlowQuery = resolve;
    });
    const slowQueryStarted = new Promise<void>((resolve) => {
      markSlowQueryStarted = resolve;
    });
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      if (sql === "SELECT slow") {
        markSlowQueryStarted();
        await slowQuery;
      }
    };
    const replacement = new FakeConnection();
    const dependencies: TursoDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    const pending = db.exec("SELECT slow");
    await slowQueryStarted;
    now = 11;
    const concurrent = db.exec("SELECT concurrent");
    expect(initial.closed).toBe(false);
    expect(initial.statements).toEqual(["SELECT slow"]);
    expect(replacement.statements).toEqual([]);

    releaseSlowQuery();
    await Promise.all([pending, concurrent]);
    await db.exec("SELECT after_drain");
    expect(initial.closed).toBe(true);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT concurrent",
      "SELECT after_drain",
    ]);

    await db.close();
  });

  test("close rejects new jobs and drains jobs already in the queue", async () => {
    let releaseSlowQuery = () => {};
    let markSlowQueryStarted = () => {};
    const slowQuery = new Promise<void>((resolve) => {
      releaseSlowQuery = resolve;
    });
    const slowQueryStarted = new Promise<void>((resolve) => {
      markSlowQueryStarted = resolve;
    });
    const connection = new FakeConnection();
    connection.exec = async (sql: string) => {
      connection.statements.push(sql);
      if (sql === "SELECT slow") {
        markSlowQueryStarted();
        await slowQuery;
      }
    };
    const dependencies: TursoDriverDependencies = {
      createToken: async () => "unused",
      connect: () => connection.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      connection.asConnection(),
    );

    const running = db.exec("SELECT slow");
    await slowQueryStarted;
    const queued = db.exec("SELECT queued");
    const closing = db.close();

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT too_late")).rejects.toThrow(
      "Turso database connection is closed",
    );
    expect(connection.closed).toBe(false);
    expect(connection.statements).toEqual(["SELECT slow"]);

    releaseSlowQuery();
    await Promise.all([running, queued, closing]);

    expect(connection.statements).toEqual(["SELECT slow", "SELECT queued"]);
    expect(connection.closed).toBe(true);
  });

  test("times out a hung readiness probe and retries", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const replacement = new FakeConnection();
    let selectAttempts = 0;
    replacement.exec = async (sql: string) => {
      replacement.statements.push(sql);
      if (sql === "SELECT 1" && ++selectAttempts === 1) {
        return new Promise<void>(() => {});
      }
    };
    const dependencies: TursoDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
      readinessProbeTimeoutMs: 1,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    now = 11;
    await db.exec("SELECT after_probe_retry");
    expect(selectAttempts).toBe(2);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_probe_retry",
    ]);
    await db.close();
  });

  test("replaces an expired transaction connection without retrying the statement", async () => {
    const initial = new FakeConnection();
    initial.inTransaction = true;
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      throw new Error("hrana stream expired");
    };
    const replacement = new FakeConnection();
    let tokenCount = 0;
    const dependencies: TursoDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT inside_transaction")).rejects.toThrow(
      "hrana stream expired",
    );
    await db.exec("SELECT after_failed_transaction");

    expect(tokenCount).toBe(1);
    expect(initial.closed).toBe(true);
    expect(initial.statements).toEqual(["SELECT inside_transaction"]);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_failed_transaction",
    ]);

    await db.close();
  });
});
