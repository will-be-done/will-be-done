import { describe, expect, test } from "bun:test";
import { execAsync } from "@will-be-done/hyperdb";
import { AsyncSqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import {
  TursodHttpError,
  TursodSqlExecutor,
  type TursodDriverDependencies,
} from "./tursod";

const connectionId = "0198b10a-b15e-7e6a-b426-c491007f4b65";
const config = {
  authToken: "test-secret",
  requestTimeoutMs: 1_000,
};

function executeResponse(
  rows: unknown[][] = [],
  autocommitAfter = true,
): Response {
  return Response.json({
    results: [
      {
        cols: [],
        rows,
        affectedRowCount: 0,
      },
    ],
    autocommitAfter,
  });
}

function dependencies(
  fetchImpl: TursodDriverDependencies["fetch"],
): TursodDriverDependencies {
  return {
    fetch: fetchImpl,
    createConnectionId: () => connectionId,
  };
}

describe("TursodSqlExecutor", () => {
  test("uses exec for connection initialization and tagged SQL", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const executor = new TursodSqlExecutor(
      "http://127.0.0.1:3001/",
      "space-test database",
      config,
      dependencies(async (input, init) => {
        requests.push({ url: String(input), init });
        return executeResponse();
      }),
    );

    await executor.open();
    await executor.exec("INSERT INTO values_table VALUES (?, ?, ?, ?, ?)", [
      42,
      1.5,
      "hello",
      new Uint8Array([1, 2, 255]),
      null,
    ]);

    expect(requests[0]).toEqual({
      url: `http://127.0.0.1:3001/dbs/space-test%20database/conn/${connectionId}/exec`,
      init: expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret",
        }),
      }),
    });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      statements: [
        {
          sql: "INSERT INTO values_table VALUES (?, ?, ?, ?, ?)",
          args: [
            { type: "integer", value: 42 },
            { type: "real", value: 1.5 },
            { type: "text", value: "hello" },
            { type: "blob", value: [1, 2, 255] },
            { type: "null" },
          ],
        },
      ],
    });

    await executor.close();
  });

  test("decodes every SQLite value returned by a prepared statement", async () => {
    let callCount = 0;
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      dependencies(async () => {
        callCount += 1;
        if (callCount === 1) return executeResponse();
        return executeResponse([
          [
            { type: "null" },
            { type: "integer", value: 3 },
            { type: "real", value: 2.25 },
            { type: "text", value: "text" },
            { type: "blob", value: [0, 128, 255] },
          ],
        ]);
      }),
    );

    await executor.open();
    const statement = executor.prepare("SELECT values FROM test");
    expect(await statement.values([])).toEqual([
      [null, 3, 2.25, "text", new Uint8Array([0, 128, 255])],
    ]);
    await executor.close();
  });

  test("preserves structured handler errors", async () => {
    let callCount = 0;
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      dependencies(async () => {
        callCount += 1;
        if (callCount === 1) return executeResponse();
        return Response.json(
          {
            code: "QUERY_FAILED",
            message: "query failed",
            autocommitAfter: true,
          },
          { status: 500 },
        );
      }),
    );

    await executor.open();
    try {
      await executor.exec("BROKEN SQL");
      throw new Error("expected tursod error");
    } catch (error) {
      expect(error).toBeInstanceOf(TursodHttpError);
      expect(error).toMatchObject({
        status: 500,
        code: "QUERY_FAILED",
        message: "query failed",
        autocommitAfter: true,
      });
    }
    await executor.close();
  });

  test("does not retry a failed statement", async () => {
    const sqlRequests: string[] = [];
    let missingReturned = false;
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      dependencies(async (input, init) => {
        expect(String(input).endsWith("/exec")).toBe(true);
        const sql = JSON.parse(String(init?.body)).statements[0].sql as string;
        sqlRequests.push(sql);
        if (sql === "SELECT lost" && !missingReturned) {
          missingReturned = true;
          return Response.json(
            {
              code: "CONNECTION_NOT_FOUND",
              message: "connection not found",
              autocommitAfter: null,
            },
            { status: 404 },
          );
        }
        return executeResponse();
      }),
    );

    await executor.open();
    // Bun's matcher is thenable at runtime, despite its type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(executor.exec("SELECT lost")).rejects.toThrow(
      "connection not found",
    );

    expect(sqlRequests.filter((sql) => sql === "SELECT lost")).toHaveLength(1);
    expect(sqlRequests).toEqual(["PRAGMA foreign_keys = ON", "SELECT lost"]);
    await executor.close();
  });

  test("drains queued jobs and rejects work queued after close", async () => {
    let releaseFirst = () => {};
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const executed: string[] = [];
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      dependencies(async (input, init) => {
        if (!String(input).endsWith("/exec")) {
          return new Response(null, { status: 204 });
        }
        const sql = JSON.parse(String(init?.body)).statements[0].sql as string;
        if (sql !== "PRAGMA foreign_keys = ON") executed.push(sql);
        if (sql === "SELECT first") await firstBlocked;
        return executeResponse();
      }),
    );

    await executor.open();
    const first = executor.exec("SELECT first");
    const second = executor.exec("SELECT second");
    const closing = executor.close();
    // Bun's matcher is thenable at runtime, despite its type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(executor.exec("SELECT late")).rejects.toThrow(
      "connection is closed",
    );
    releaseFirst();
    await Promise.all([first, second, closing]);
    expect(executed).toEqual(["SELECT first", "SELECT second"]);
  });

  test("times out a stalled request and continues queued work", async () => {
    const executed: string[] = [];
    const urls: string[] = [];
    const connectionIds = [
      "0198b10a-b15e-7e6a-b426-c491007f4b65",
      "0198b10a-b15e-7e6a-b426-c491007f4b66",
    ];
    let nextConnectionId = 0;
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      { ...config, requestTimeoutMs: 10 },
      {
        createConnectionId: () => connectionIds[nextConnectionId++]!,
        fetch: async (input, init) => {
          urls.push(String(input));
          const sql = JSON.parse(String(init?.body)).statements[0]
            .sql as string;
          executed.push(sql);
          if (sql === "SELECT stalled") {
            return await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              );
            });
          }
          return executeResponse();
        },
      },
    );

    await executor.open();
    const stalled = executor.exec("SELECT stalled");
    const next = executor.exec("SELECT next");
    // Bun's matcher is thenable at runtime, despite its type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(stalled).rejects.toThrow();
    await next;
    await executor.close();

    expect(executed).toEqual([
      "PRAGMA foreign_keys = ON",
      "SELECT stalled",
      "SELECT next",
    ]);
    expect(urls[1]).toContain(`/conn/${connectionIds[0]}/exec`);
    expect(urls[2]).toContain(`/conn/${connectionIds[1]}/exec`);
  });

  test("treats an ambiguous cleanup rollback as complete on a fresh connection", async () => {
    const connectionIds = [
      "0198b10a-b15e-7e6a-b426-c491007f4b65",
      "0198b10a-b15e-7e6a-b426-c491007f4b66",
    ];
    let nextConnectionId = 0;
    const urls: string[] = [];
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      {
        createConnectionId: () => connectionIds[nextConnectionId++]!,
        fetch: async (input, init) => {
          urls.push(String(input));
          const sql = JSON.parse(String(init?.body)).statements[0]
            .sql as string;
          if (sql === "ROLLBACK") throw new TypeError("connection reset");
          return executeResponse();
        },
      },
    );

    await executor.open();
    await executor.exec("ROLLBACK");
    await executor.exec("SELECT after_cleanup");
    await executor.close();

    expect(urls[1]).toContain(`/conn/${connectionIds[0]}/exec`);
    expect(urls[2]).toContain(`/conn/${connectionIds[1]}/exec`);
  });

  test("releases the HyperDB transaction lock after tursod already rolled back a failed query", async () => {
    let inTransaction = false;
    const statements: string[] = [];
    const executor = new TursodSqlExecutor(
      "http://tursod.test",
      "main-main",
      config,
      dependencies(async (_input, init) => {
        const sql = JSON.parse(String(init?.body)).statements[0].sql as string;
        statements.push(sql);

        if (sql === "BEGIN TRANSACTION") {
          inTransaction = true;
          return executeResponse([], false);
        }
        if (sql === "INSERT INTO recovery VALUES (1)") {
          return executeResponse([], false);
        }
        if (sql === "INSERT INTO missing_table VALUES (1)") {
          inTransaction = false;
          return Response.json(
            {
              code: "QUERY_FAILED",
              message: "query failed",
              autocommitAfter: true,
            },
            { status: 500 },
          );
        }
        if (sql === "ROLLBACK") {
          inTransaction = false;
          return executeResponse([], true);
        }
        return executeResponse([], !inTransaction);
      }),
    );
    await executor.open();
    const driver = new AsyncSqlDriver(executor);
    const transaction = await execAsync(driver.beginTx());

    await executor.exec("INSERT INTO recovery VALUES (1)");
    // Bun's matcher is thenable at runtime, despite its type declaration.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(
      executor.exec("INSERT INTO missing_table VALUES (1)"),
    ).rejects.toThrow("query failed");
    await execAsync(transaction.rollback());

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const nextTransaction = await Promise.race([
      execAsync(driver.beginTx()),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("HyperDB transaction lock was not released")),
          100,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
    await execAsync(nextTransaction.rollback());
    await executor.close();

    expect(statements).toEqual([
      "PRAGMA foreign_keys = ON",
      "BEGIN TRANSACTION",
      "INSERT INTO recovery VALUES (1)",
      "INSERT INTO missing_table VALUES (1)",
      "ROLLBACK",
      "BEGIN TRANSACTION",
      "ROLLBACK",
    ]);
  });
});
