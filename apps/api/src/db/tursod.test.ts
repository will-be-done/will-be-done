import { describe, expect, test } from "bun:test";
import {
  TursodHttpError,
  TursodSqlExecutor,
  type TursodDriverDependencies,
} from "./tursod";

const connectionId = "0198b10a-b15e-7e6a-b426-c491007f4b65";

function executeResponse(rows: unknown[][] = []): Response {
  return Response.json({
    results: [
      {
        cols: [],
        rows,
        affectedRowCount: 0,
      },
    ],
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
      init: expect.objectContaining({ method: "POST" }),
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
      dependencies(async () => {
        callCount += 1;
        if (callCount === 1) return executeResponse();
        return Response.json(
          { code: "QUERY_FAILED", message: "query failed" },
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
});
