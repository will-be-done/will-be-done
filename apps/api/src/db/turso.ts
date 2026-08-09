import { createClient as createTursoApiClient } from "@tursodatabase/api";
import {
  connect,
  type Connection,
} from "@tursodatabase/serverless";
import {
  AsyncSqlDriver,
  type AsyncSQLStatement,
  type AsyncSQLiteDB,
  type SqlValue,
  logAsyncSqlDriverDebugEvent,
} from "@will-be-done/hyperdb/drivers/sqlite";
import { getEnvConfig } from "../env";
import { State } from "../utils/State";

export type TursoDatabaseType = "user" | "space";
export type TursoDatabaseTypeWithMain = "main" | TursoDatabaseType;

type TursoTokenFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type TursoTokenConfig = {
  organization: string;
  platformToken: string;
};

const DATABASE_TOKEN_LIFETIME = {
  expiration: "1h",
  milliseconds: 60 * 60 * 1_000,
} as const;
const DATABASE_TOKEN_REFRESH_AFTER_MS =
  DATABASE_TOKEN_LIFETIME.milliseconds / 2;
const TURSO_DATABASE_NAME_MAX_LENGTH = 56;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TURSO_READINESS_PROBE_TIMEOUT_MS = 10_000;
const TURSO_QUERY_TIMEOUT_MS = 5 * 60_000;
const TURSO_SLOW_JOB_WARNING_MS = 5_000;
const TURSO_IDLE_SESSION_PROBE_AFTER_MS = 20_000;
const TURSO_CLOSE_TIMEOUT_MS = 5_000;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function sanitizeNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function buildTursoDatabaseName(
  prefixValue: string,
  dbType: TursoDatabaseTypeWithMain,
  dbId: string,
): string {
  const prefix = sanitizeNamePart(prefixValue) || "wbd";
  if (dbType === "main") {
    const suffix = "-main";
    if (prefix.length + suffix.length > TURSO_DATABASE_NAME_MAX_LENGTH) {
      throw new Error(
        `Turso database prefix is too long for the main database (maximum ${TURSO_DATABASE_NAME_MAX_LENGTH - suffix.length} characters)`,
      );
    }
    return `${prefix}${suffix}`;
  }

  if (!UUID_PATTERN.test(dbId)) {
    throw new Error(`Turso ${dbType} database ID must be a UUID`);
  }

  const suffix = `-${dbType}-${dbId.toLowerCase()}`;
  if (prefix.length + suffix.length > TURSO_DATABASE_NAME_MAX_LENGTH) {
    throw new Error(
      `Turso database prefix is too long for ${dbType} database names (maximum ${TURSO_DATABASE_NAME_MAX_LENGTH - suffix.length} characters)`,
    );
  }
  return `${prefix}${suffix}`;
}

export function getTursoDatabaseName(
  dbType: TursoDatabaseTypeWithMain,
  dbId: string,
): string {
  return buildTursoDatabaseName(
    getEnvConfig().WBD_TURSO_DATABASE_PREFIX,
    dbType,
    dbId,
  );
}

function databaseUrl(hostnameOrUrl: string): string {
  if (
    hostnameOrUrl.startsWith("libsql://") ||
    hostnameOrUrl.startsWith("https://") ||
    hostnameOrUrl.startsWith("http://")
  ) {
    return hostnameOrUrl;
  }
  return `libsql://${hostnameOrUrl}`;
}

function errorStatus(error: unknown): number | undefined {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

export async function createTursoDatabaseToken(
  databaseName: string,
  config: TursoTokenConfig,
  fetchImpl: TursoTokenFetch = fetch,
): Promise<string> {
  const url = new URL(
    `https://api.turso.tech/v1/organizations/${encodeURIComponent(config.organization)}/databases/${encodeURIComponent(databaseName)}/auth/tokens`,
  );
  url.searchParams.set("expiration", DATABASE_TOKEN_LIFETIME.expiration);
  url.searchParams.set("authorization", "full-access");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.platformToken}`,
    },
  });

  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail =
      body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
        ? `: ${body.error}`
        : "";
    throw new Error(
      `Failed to create Turso database token (status ${response.status})${detail}`,
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("jwt" in body) ||
    typeof body.jwt !== "string"
  ) {
    throw new Error("Turso database token response did not include a JWT");
  }

  return body.jwt;
}

export async function getOrCreateTursoDatabase(
  dbType: TursoDatabaseTypeWithMain,
  dbId: string,
): Promise<{ name: string; url: string }> {
  const env = getEnvConfig();
  const client = createTursoApiClient({
    org: env.WBD_TURSO_ORG!,
    token: env.WBD_TURSO_PLATFORM_TOKEN!,
  });
  const name = getTursoDatabaseName(dbType, dbId);
  console.log(`[Turso Provision] resolving ${dbType} database "${name}"`);

  try {
    const existing = await client.databases.get(name);
    console.log(`[Turso Provision] using existing database "${name}"`);
    return { name, url: databaseUrl(existing.hostname) };
  } catch (error) {
    if (errorStatus(error) !== 404) {
      throw new Error(
        `Failed to look up Turso ${dbType} database "${name}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  console.log(`[Turso Provision] creating ${dbType} database "${name}"`);
  try {
    const created = await client.databases.create(name, {
      group: env.WBD_TURSO_GROUP,
      useTursoDb: true
    });
    console.log(`[Turso Provision] created database "${name}"`);
    return { name, url: databaseUrl(created.hostname) };
  } catch (error) {
    if (errorStatus(error) !== 409) {
      throw new Error(
        `Failed to create Turso ${dbType} database "${name}": ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    try {
      const existing = await client.databases.get(name);
      console.log(
        `[Turso Provision] using concurrently created database "${name}"`,
      );
      return { name, url: databaseUrl(existing.hostname) };
    } catch (getError) {
      throw new Error(
        `Failed to look up concurrently created Turso ${dbType} database "${name}": ${getError instanceof Error ? getError.message : String(getError)}`,
        { cause: getError },
      );
    }
  }
}

class TursoAsyncStatement implements AsyncSQLStatement {
  constructor(
    private readonly execute: (values: SqlValue[]) => Promise<SqlValue[][]>,
  ) {}

  async values(values: SqlValue[]): Promise<SqlValue[][]> {
    return this.execute(values);
  }

  finalize(): void {
    // Turso serverless statements do not own native resources.
  }
}

type ConnectionFactory = (url: string, authToken: string) => Connection;
type SqlJob = {
  sql: string;
  operation: (connection: Connection) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};
type SqlExecutorState = {
  jobs: SqlJob[];
  closing: boolean;
};

function isExpiredTursoSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? error.code : undefined;
  return (
    code === "HRANA_STREAM_EXPIRED" ||
    /\bhrana stream expired\b/i.test(error.message)
  );
}

function isTursoConnectionFailure(error: unknown): boolean {
  if (isExpiredTursoSessionError(error)) return true;
  if (!(error instanceof Error)) return false;

  const code = "code" in error ? error.code : undefined;
  return (
    code === "TIMEOUT" ||
    /^HTTP error! status: (401|404|408|5\d\d)\b/.test(error.message)
  );
}

function isNonRetryableTursoEndpointError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^HTTP error! status: (401|404)\b/.test(error.message)
  );
}

async function runReadinessProbe(
  connection: Connection,
  sql: string,
  timeoutMs: number,
): Promise<void> {
  await connection.exec(sql, { queryTimeout: timeoutMs });
}

export type TursoDriverDependencies = {
  createToken: (databaseName: string) => Promise<string>;
  connect: ConnectionFactory;
  now: () => number;
  refreshAfterMs: number;
  readinessProbeTimeoutMs?: number;
};

const defaultDriverDependencies = (): TursoDriverDependencies => {
  const env = getEnvConfig();

  return {
    createToken: (databaseName) =>
      createTursoDatabaseToken(databaseName, {
        organization: env.WBD_TURSO_ORG!,
        platformToken: env.WBD_TURSO_PLATFORM_TOKEN!,
      }),
    connect: (url, authToken) =>
      connect({
        url,
        authToken,
        defaultQueryTimeout: TURSO_QUERY_TIMEOUT_MS,
      }),
    now: Date.now,
    refreshAfterMs: DATABASE_TOKEN_REFRESH_AFTER_MS,
  };
};

async function openConnection(
  url: string,
  databaseName: string,
  dependencies: TursoDriverDependencies,
): Promise<Connection> {
  const authToken = await dependencies.createToken(databaseName);
  const connection = dependencies.connect(url, authToken);

  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const timeoutMs =
        dependencies.readinessProbeTimeoutMs ??
        TURSO_READINESS_PROBE_TIMEOUT_MS;
      await runReadinessProbe(connection, "SELECT 1", timeoutMs);
      await runReadinessProbe(connection, "PRAGMA foreign_keys = ON", timeoutMs);
      return connection;
    } catch (error) {
      lastError = error;
      if (isNonRetryableTursoEndpointError(error)) break;
      if (attempt < 5) await delay(100 * 2 ** attempt);
    }
  }

  await connection.close().catch(() => undefined);
  throw new Error(`Turso database did not become ready: ${String(lastError)}`, {
    cause: lastError,
  });
}

export class TursoSqlExecutor implements AsyncSQLiteDB {
  // Only runLoop reads from or replaces the connection.
  private connection: Connection;
  private refreshAt: number;
  private lastActivityAt: number;
  // A failed replacement leaves the old connection in place for the next job
  // to retry replacing without executing SQL on a known-expired session.
  private replacementRequired = false;
  private readonly state = new State<SqlExecutorState>({
    jobs: [],
    closing: false,
  });
  private readonly loopPromise: Promise<void>;

  constructor(
    private readonly url: string,
    private readonly databaseName: string,
    private readonly dependencies: TursoDriverDependencies,
    connection: Connection,
  ) {
    this.connection = connection;
    const now = dependencies.now();
    this.refreshAt = now + dependencies.refreshAfterMs;
    this.lastActivityAt = now;
    this.loopPromise = this.runLoop();
  }

  private async replaceConnection(): Promise<void> {
    const previous = this.connection;
    const replacement = await openConnection(
      this.url,
      this.databaseName,
      this.dependencies,
    );

    this.connection = replacement;
    this.replacementRequired = false;
    this.refreshAt = this.dependencies.now() + this.dependencies.refreshAfterMs;
    void previous.close().catch((error) => {
      console.warn(
        `[Turso SQL ${this.databaseName}] failed to close replaced connection`,
        error,
      );
    });
  }

  private async refreshConnectionIfNeeded(): Promise<void> {
    if (this.replacementRequired) {
      await this.replaceConnection();
      return;
    }
    if (this.connection.inTransaction) return;

    const now = this.dependencies.now();
    if (now >= this.refreshAt) {
      this.replacementRequired = true;
      await this.replaceConnection();
      return;
    }

    if (now - this.lastActivityAt < TURSO_IDLE_SESSION_PROBE_AFTER_MS) {
      return;
    }

    try {
      await this.connection.exec("SELECT 1", {
        queryTimeout: TURSO_READINESS_PROBE_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn(
        `[Turso SQL ${this.databaseName}] idle session probe failed; replacing connection: ${String(error)}`,
      );
      this.replacementRequired = true;
      await this.replaceConnection();
    }
  }

  private async executeJob(job: SqlJob): Promise<void> {
    let phase = "refreshing connection";
    const normalizedSql = job.sql.replace(/\s+/g, " ").trim().slice(0, 300);
    const slowWarning = setTimeout(() => {
      console.warn(
        `[Turso SQL ${this.databaseName}] job is still ${phase} after ${TURSO_SLOW_JOB_WARNING_MS / 1_000}s; queued=${this.state.get().jobs.length}; sql=${normalizedSql}`,
      );
    }, TURSO_SLOW_JOB_WARNING_MS);

    try {
      try {
        await this.refreshConnectionIfNeeded();
      } catch (error) {
        job.reject(error);
        return;
      }

      phase = "executing SQL";
      try {
        job.resolve(await job.operation(this.connection));
      } catch (error) {
        if (!isTursoConnectionFailure(error)) {
          job.reject(error);
          return;
        }

        this.replacementRequired = true;
        if (isExpiredTursoSessionError(error)) {
          console.warn(
            `[Turso SQL ${this.databaseName}] server session expired; replacing connection`,
          );
          await this.replaceConnection().catch((replacementError) => {
            console.warn(
              `[Turso SQL ${this.databaseName}] failed to replace expired connection`,
              replacementError,
            );
          });
        } else {
          console.warn(
            `[Turso SQL ${this.databaseName}] connection failed; will replace before the next SQL job: ${String(error)}`,
          );
        }
        job.reject(error);
      }
    } finally {
      this.lastActivityAt = this.dependencies.now();
      clearTimeout(slowWarning);
    }
  }

  private takeNextJob(): SqlJob | undefined {
    let nextJob: SqlJob | undefined;
    this.state.modify((state) => {
      nextJob = state.jobs[0];
      return { ...state, jobs: state.jobs.slice(1) };
    });
    return nextJob;
  }

  private async runLoop(): Promise<void> {
    while (true) {
      await this.state.when(
        (state) => state.closing || state.jobs.length > 0,
      );
      const job = this.takeNextJob();
      if (!job) break;
      await this.executeJob(job);
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, TURSO_CLOSE_TIMEOUT_MS);
      void Promise.resolve()
        .then(() => this.connection.close())
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(timeout);
          resolve();
        });
    });
  }

  private enqueue<T>(
    sql: string,
    operation: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    if (this.state.get().closing) {
      return Promise.reject(new Error("Turso database connection is closed"));
    }

    return new Promise<T>((resolve, reject) => {
      this.state.modify((state) => ({
        ...state,
        jobs: [
          ...state.jobs,
          {
            sql,
            operation,
            resolve: (value) => resolve(value as T),
            reject,
          },
        ],
      }));
    });
  }

  async exec(sql: string, params?: SqlValue[] | null): Promise<void> {
    await this.enqueue(sql, async (connection) => {
      if (params && params.length > 0) {
        const statement = await connection.prepare(sql);
        await statement.run(params);
        return;
      }
      await connection.exec(sql);
    });
  }

  async prepare(sql: string): Promise<AsyncSQLStatement> {
    return new TursoAsyncStatement(
      (values) =>
        this.enqueue(sql, async (connection) => {
          const statement = await connection.prepare(sql);
          return (await statement.raw().all(values)) as SqlValue[][];
        }),
    );
  }

  async close(): Promise<void> {
    if (!this.state.get().closing) {
      this.state.modify((state) => ({ ...state, closing: true }));
    }
    await this.loopPromise;
  }
}

export async function createTursoSqlDriver(
  databaseName: string,
  url: string,
): Promise<{
  driver: AsyncSqlDriver;
  close: () => Promise<void>;
}> {
  const normalizedUrl = databaseUrl(url);
  const dependencies = defaultDriverDependencies();
  const connection = await openConnection(
    normalizedUrl,
    databaseName,
    dependencies,
  );
  const db = new TursoSqlExecutor(
    normalizedUrl,
    databaseName,
    dependencies,
    connection,
  );
  return {
    driver: new AsyncSqlDriver(db, {
      debug: logAsyncSqlDriverDebugEvent,
    }),
    close: () => db.close(),
  };
}
