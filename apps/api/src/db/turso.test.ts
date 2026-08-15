import { describe, expect, test } from "bun:test";
import type { Connection, QueryOptions } from "@tursodatabase/serverless";
import {
  buildTursoDatabaseName,
  createTursoDatabaseToken,
  TursoCloudSqlExecutor,
  type TursoCloudDriverDependencies,
} from "./turso";

class FakeConnection {
  inTransaction = false;
  closed = false;
  reconnectCount = 0;
  readonly statements: string[] = [];

  async exec(sql: string, _options?: QueryOptions): Promise<void> {
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
    const name = buildTursoDatabaseName("wbd-local-quo", "space", spaceId);

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

describe("Turso Cloud database credentials", () => {
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
    const dependencies: TursoCloudDriverDependencies = {
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
    const db = new TursoCloudSqlExecutor(
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

  test("replaces an idle session before the next SQL job when probing fails", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const originalExec = initial.exec.bind(initial);
    initial.exec = async (sql: string, options?: QueryOptions) => {
      if (sql === "SELECT 1" && initial.statements.length > 0) {
        initial.statements.push(sql);
        throw new Error("HTTP error! status: 404");
      }
      await originalExec(sql, options);
    };
    const replacement = new FakeConnection();
    let tokenCount = 0;
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      {
        createToken: async () => `token-${++tokenCount}`,
        connect: () => replacement.asConnection(),
        now: () => now,
        refreshAfterMs: 60_000,
      },
      initial.asConnection(),
    );

    await db.exec("SELECT before_idle");
    now = 20_001;
    await db.exec("SELECT after_idle");

    expect(tokenCount).toBe(1);
    expect(initial.statements).toEqual(["SELECT before_idle", "SELECT 1"]);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_idle",
    ]);

    await db.close();
  });

  test("retries replacement after an idle-probe replacement fails", async () => {
    let now = 0;
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      if (sql === "SELECT 1") throw new Error("idle probe failed");
    };
    const replacement = new FakeConnection();
    let connectAttempts = 0;
    let tokenCount = 0;
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      {
        createToken: async () => `token-${++tokenCount}`,
        connect: () => {
          connectAttempts += 1;
          if (connectAttempts === 1) throw new Error("connect failed");
          return replacement.asConnection();
        },
        now: () => now,
        refreshAfterMs: 60_000,
      },
      initial.asConnection(),
    );

    await db.exec("SELECT before_idle");
    now = 20_001;
    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT after_idle")).rejects.toThrow(
      "connect failed",
    );
    await db.exec("SELECT after_replacement_retry");

    expect(connectAttempts).toBe(2);
    expect(tokenCount).toBe(2);
    expect(initial.statements).toEqual(["SELECT before_idle", "SELECT 1"]);
    expect(initial.closed).toBe(true);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_replacement_retry",
    ]);

    await db.close();
    expect(replacement.closed).toBe(true);
  });

  test("does not block SQL while a replaced connection is closing", async () => {
    let now = 0;
    const initial = new FakeConnection();
    initial.close = async () => {
      initial.closed = true;
      await new Promise<void>(() => {});
    };
    const replacement = new FakeConnection();
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "fresh-token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    now = 11;
    await db.exec("SELECT after_refresh");

    expect(initial.closed).toBe(true);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT after_refresh",
    ]);
    await db.close();
  });

  test("does not replace a connection in the middle of a transaction", async () => {
    let now = 0;
    let tokenCount = 0;
    const initial = new FakeConnection();
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => new FakeConnection().asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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

    const dependencies: TursoCloudDriverDependencies = {
      createToken: async (databaseName) => {
        tokenDatabaseNames.push(databaseName);
        return "fresh-token";
      },
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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

  test("replaces a connection after a pipeline 404 without replaying", async () => {
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      throw new Error("HTTP error! status: 404");
    };
    const replacement = new FakeConnection();
    let tokenCount = 0;
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT missing_database")).rejects.toThrow(
      "HTTP error! status: 404",
    );
    expect(tokenCount).toBe(0);
    expect(initial.statements).toEqual(["SELECT missing_database"]);

    await db.exec("SELECT next_query");
    expect(tokenCount).toBe(1);
    expect(replacement.statements).toEqual([
      "SELECT 1",
      "PRAGMA foreign_keys = ON",
      "SELECT next_query",
    ]);

    await db.close();
  });

  test("does not replace a connection after an HTTP 429 response", async () => {
    const initial = new FakeConnection();
    initial.exec = async (sql: string) => {
      initial.statements.push(sql);
      if (sql === "SELECT rate_limited") {
        throw new Error("HTTP error! status: 429");
      }
    };
    let tokenCount = 0;
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      {
        createToken: async () => `token-${++tokenCount}`,
        connect: () => new FakeConnection().asConnection(),
        now: () => 0,
        refreshAfterMs: 10,
      },
      initial.asConnection(),
    );

    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT rate_limited")).rejects.toThrow(
      "HTTP error! status: 429",
    );
    await db.exec("SELECT after_rate_limit");

    expect(tokenCount).toBe(0);
    expect(initial.statements).toEqual([
      "SELECT rate_limited",
      "SELECT after_rate_limit",
    ]);
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
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "unused",
      connect: () => connection.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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

  test("retries after a driver-enforced readiness probe timeout", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const replacement = new FakeConnection();
    let selectAttempts = 0;
    const probeTimeouts: Array<number | undefined> = [];
    replacement.exec = async (sql: string, options) => {
      replacement.statements.push(sql);
      if (sql === "SELECT 1" || sql === "PRAGMA foreign_keys = ON") {
        probeTimeouts.push(options?.queryTimeout);
      }
      if (sql === "SELECT 1" && ++selectAttempts === 1) {
        throw new Error("query timed out");
      }
    };
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
      readinessProbeTimeoutMs: 1,
    };
    const db = new TursoCloudSqlExecutor(
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
    expect(probeTimeouts).toEqual([1, 1, 1]);
    await db.close();
  });

  test("fails fast when a replacement endpoint returns 404", async () => {
    let now = 0;
    const initial = new FakeConnection();
    const replacement = new FakeConnection();
    replacement.exec = async (sql: string) => {
      replacement.statements.push(sql);
      throw new Error("HTTP error! status: 404");
    };
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => "token",
      connect: () => replacement.asConnection(),
      now: () => now,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
      "libsql://main-db.turso.io",
      "wbd-main",
      dependencies,
      initial.asConnection(),
    );

    now = 11;
    // Bun's matcher is thenable at runtime, despite its current type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(db.exec("SELECT after_refresh")).rejects.toThrow(
      "Turso database did not become ready",
    );
    expect(replacement.statements).toEqual(["SELECT 1"]);
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
    const dependencies: TursoCloudDriverDependencies = {
      createToken: async () => `token-${++tokenCount}`,
      connect: () => replacement.asConnection(),
      now: () => 0,
      refreshAfterMs: 10,
    };
    const db = new TursoCloudSqlExecutor(
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
