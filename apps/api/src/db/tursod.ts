import {
  AsyncSqlDriver,
  type AsyncSQLStatement,
  type AsyncSQLiteDB,
  type SqlValue,
  logAsyncSqlDriverDebugEvent,
} from "@will-be-done/hyperdb/drivers/sqlite";
import { State } from "../utils/State";

type TursodValue =
  | { type: "null" }
  | { type: "integer"; value: number }
  | { type: "real"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; value: number[] };

type TursodResult = {
  cols: Array<{ name: string; declType: string }>;
  rows: TursodValue[][];
  affectedRowCount: number;
};

type TursodExecuteResponse = {
  results: TursodResult[];
};

type TursodErrorBody = {
  code: string;
  message: string;
};

type TursodFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TursodDriverDependencies = {
  fetch: TursodFetch;
  createConnectionId: () => string;
};

type SqlJob = {
  sql: string;
  params: SqlValue[];
  resolve: (value: TursodResult) => void;
  reject: (error: unknown) => void;
};

type ExecutorState = {
  jobs: SqlJob[];
  closing: boolean;
};

const CONNECTION_MISSING_CODES = new Set([
  "DATABASE_NOT_OPENED",
  "DATABASE_NOT_INITIALIZED",
  "CONNECTION_NOT_FOUND",
]);

function isTursodErrorBody(value: unknown): value is TursodErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export class TursodHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "TursodHttpError";
  }
}

function encodeValue(value: SqlValue): TursodValue {
  if (value === null) return { type: "null" };
  if (value instanceof Uint8Array) {
    return { type: "blob", value: Array.from(value) };
  }
  if (typeof value === "string") return { type: "text", value };
  if (!Number.isFinite(value)) {
    throw new Error("tursod cannot encode a non-finite SQLite number");
  }
  return Number.isInteger(value)
    ? { type: "integer", value }
    : { type: "real", value };
}

function decodeValue(value: TursodValue): SqlValue {
  switch (value.type) {
    case "null":
      return null;
    case "integer":
    case "real":
      return value.value;
    case "text":
      return value.value;
    case "blob":
      return Uint8Array.from(value.value);
  }
}

export function numberAnonymousSqlParameters(
  sql: string,
  expectedCount: number,
): string {
  let output = "";
  let parameterCount = 0;
  let state:
    | "normal"
    | "single"
    | "double"
    | "backtick"
    | "bracket"
    | "line-comment"
    | "block-comment" = "normal";

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    const next = sql[index + 1];
    output += char;

    if (state === "line-comment") {
      if (char === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += next;
        index += 1;
        state = "normal";
      }
      continue;
    }
    if (state === "bracket") {
      if (char === "]") state = "normal";
      continue;
    }
    if (state !== "normal") {
      const quote = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (char === quote) {
        if (next === quote) {
          output += next;
          index += 1;
        } else {
          state = "normal";
        }
      }
      continue;
    }

    if (char === "-" && next === "-") {
      output += next;
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      output += next;
      index += 1;
      state = "block-comment";
    } else if (char === "'") {
      state = "single";
    } else if (char === '"') {
      state = "double";
    } else if (char === "`") {
      state = "backtick";
    } else if (char === "[") {
      state = "bracket";
    } else if (char === "?") {
      if (next !== undefined && /[0-9]/.test(next)) {
        throw new Error("tursod only supports anonymous positional parameters");
      }
      parameterCount += 1;
      output += String(parameterCount);
    }
  }

  if (parameterCount !== expectedCount) {
    throw new Error(
      `SQL parameter count mismatch: expected ${parameterCount}, received ${expectedCount}`,
    );
  }
  return output;
}

class TursodAsyncStatement implements AsyncSQLStatement {
  constructor(
    private readonly execute: (values: SqlValue[]) => Promise<SqlValue[][]>,
  ) {}

  values(values: SqlValue[]): Promise<SqlValue[][]> {
    return this.execute(values);
  }

  finalize(): void {
    // Statements are prepared and finalized inside tursod for each request.
  }
}

export class TursodSqlExecutor implements AsyncSQLiteDB {
  private readonly baseUrl: string;
  private readonly connectionId: string;
  private connectionOpen = false;
  private readonly state = new State<ExecutorState>({
    jobs: [],
    closing: false,
  });
  private readonly loopPromise: Promise<void>;

  constructor(
    baseUrl: string,
    private readonly databaseName: string,
    private readonly dependencies: TursodDriverDependencies = {
      fetch,
      createConnectionId: () => crypto.randomUUID(),
    },
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.connectionId = dependencies.createConnectionId();
    this.loopPromise = this.runLoop();
  }

  private get connectionUrl(): string {
    return `${this.baseUrl}/dbs/${encodeURIComponent(this.databaseName)}/conn/${encodeURIComponent(this.connectionId)}`;
  }

  private async responseError(response: Response): Promise<TursodHttpError> {
    const body: unknown = await response.json().catch(() => undefined);
    if (isTursodErrorBody(body)) {
      return new TursodHttpError(response.status, body.code, body.message);
    }
    return new TursodHttpError(
      response.status,
      undefined,
      `tursod request failed with status ${response.status}`,
    );
  }

  private async executeRequest(
    sql: string,
    params: SqlValue[],
  ): Promise<TursodResult> {
    const numberedSql = numberAnonymousSqlParameters(sql, params.length);
    const response = await this.dependencies.fetch(
      `${this.connectionUrl}/exec`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statements: [
            {
              sql: numberedSql,
              namedArgs: params.map((value, index) => ({
                name: `?${index + 1}`,
                value: encodeValue(value),
              })),
            },
          ],
        }),
      },
    );

    if (!response.ok) throw await this.responseError(response);
    const payload = (await response.json()) as TursodExecuteResponse;
    const result = payload.results?.[0];
    if (!result || !Array.isArray(result.rows)) {
      throw new Error("tursod returned an invalid execute response");
    }
    return result;
  }

  private async ensureConnection(): Promise<void> {
    if (this.connectionOpen) return;
    const response = await this.dependencies.fetch(this.connectionUrl, {
      method: "POST",
    });
    if (!response.ok) throw await this.responseError(response);
    this.connectionOpen = true;
    try {
      await this.executeRequest("PRAGMA foreign_keys = ON", []);
    } catch (error) {
      this.connectionOpen = false;
      throw error;
    }
  }

  async open(): Promise<void> {
    await this.ensureConnection();
  }

  private takeNextJob(): SqlJob | undefined {
    let job: SqlJob | undefined;
    this.state.modify((state) => {
      job = state.jobs[0];
      return { ...state, jobs: state.jobs.slice(1) };
    });
    return job;
  }

  private async runLoop(): Promise<void> {
    while (true) {
      await this.state.when((state) => state.closing || state.jobs.length > 0);
      const job = this.takeNextJob();
      if (!job) break;

      try {
        await this.ensureConnection();
        job.resolve(await this.executeRequest(job.sql, job.params));
      } catch (error) {
        if (
          error instanceof TursodHttpError &&
          error.code !== undefined &&
          CONNECTION_MISSING_CODES.has(error.code)
        ) {
          this.connectionOpen = false;
        }
        job.reject(error);
      }
    }
  }

  private enqueue(sql: string, params: SqlValue[]): Promise<TursodResult> {
    if (this.state.get().closing) {
      return Promise.reject(new Error("tursod database connection is closed"));
    }
    return new Promise<TursodResult>((resolve, reject) => {
      this.state.modify((state) => ({
        ...state,
        jobs: [...state.jobs, { sql, params, resolve, reject }],
      }));
    });
  }

  async exec(sql: string, params?: SqlValue[] | null): Promise<void> {
    await this.enqueue(sql, params ?? []);
  }

  prepare(sql: string): AsyncSQLStatement {
    return new TursodAsyncStatement(async (values) => {
      const result = await this.enqueue(sql, values);
      return result.rows.map((row) => row.map(decodeValue));
    });
  }

  async close(): Promise<void> {
    if (!this.state.get().closing) {
      this.state.modify((state) => ({ ...state, closing: true }));
    }
    await this.loopPromise;
  }
}

export async function createTursodSqlDriver(
  databaseName: string,
  baseUrl: string,
): Promise<{ driver: AsyncSqlDriver; close: () => Promise<void> }> {
  const executor = new TursodSqlExecutor(baseUrl, databaseName);
  await executor.open();
  return {
    driver: new AsyncSqlDriver(executor, {
      debug: logAsyncSqlDriverDebugEvent,
    }),
    close: () => executor.close(),
  };
}
