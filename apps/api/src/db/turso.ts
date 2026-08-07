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
const TURSO_READINESS_PROBE_TIMEOUT_MS = 10_000;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function sanitizeNamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36);
}

export function buildTursoDatabaseName(
  prefixValue: string,
  dbType: TursoDatabaseTypeWithMain,
  dbId: string,
): string {
  const prefix = sanitizeNamePart(prefixValue) || "wbd";
  if (dbType === "main") {
    const suffix = "-main";
    const head = prefix
      .slice(0, TURSO_DATABASE_NAME_MAX_LENGTH - suffix.length)
      .replace(/-+$/g, "");
    return `${head}${suffix}`;
  }

  const sanitizedId = sanitizeNamePart(dbId);
  const hash = fnv1a64(dbId);
  const rawName = `${prefix}-${dbType}-${sanitizedId || "db"}-${hash}`;
  if (rawName.length <= TURSO_DATABASE_NAME_MAX_LENGTH) return rawName;

  const suffix = fnv1a64(rawName);
  const head = rawName
    .slice(0, TURSO_DATABASE_NAME_MAX_LENGTH - suffix.length - 1)
    .replace(/-+$/g, "");
  return `${head}-${suffix}`;
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
type ConnectionLease = {
  connection: Connection;
  release: () => void;
};

function isExpiredTursoSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? error.code : undefined;
  return (
    code === "HRANA_STREAM_EXPIRED" ||
    /\bhrana stream expired\b/i.test(error.message)
  );
}

async function runReadinessProbe(
  connection: Connection,
  sql: string,
  timeoutMs: number,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Turso readiness probe timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    await Promise.race([
      connection.exec(sql, { queryTimeout: timeoutMs }),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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
    connect: (url, authToken) => connect({ url, authToken }),
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
      if (attempt < 5) await delay(100 * 2 ** attempt);
    }
  }

  await connection.close().catch(() => undefined);
  throw new Error(`Turso database did not become ready: ${String(lastError)}`, {
    cause: lastError,
  });
}

export class RotatingTursoAsyncSQLiteDB implements AsyncSQLiteDB {
  private connection: Connection;
  private refreshAt: number;
  private refreshPromise: Promise<Connection> | undefined;
  private recoveryPromise: Promise<void> | undefined;
  private readonly inFlight = new Map<Connection, number>();
  private readonly idleWaiters = new Map<Connection, Set<() => void>>();
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly databaseName: string,
    private readonly dependencies: TursoDriverDependencies,
    connection: Connection,
  ) {
    this.connection = connection;
    this.refreshAt = dependencies.now() + dependencies.refreshAfterMs;
  }

  private acquire(connection: Connection): ConnectionLease {
    this.inFlight.set(connection, (this.inFlight.get(connection) ?? 0) + 1);
    let released = false;
    return {
      connection,
      release: () => {
        if (released) return;
        released = true;
        const remaining = (this.inFlight.get(connection) ?? 1) - 1;
        if (remaining > 0) {
          this.inFlight.set(connection, remaining);
          return;
        }
        this.inFlight.delete(connection);
        const waiters = this.idleWaiters.get(connection);
        this.idleWaiters.delete(connection);
        for (const resolve of waiters ?? []) resolve();
      },
    };
  }

  private waitForIdle(connection: Connection): Promise<void> {
    if ((this.inFlight.get(connection) ?? 0) === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const waiters = this.idleWaiters.get(connection) ?? new Set();
      waiters.add(resolve);
      this.idleWaiters.set(connection, waiters);
    });
  }

  private async getConnection(): Promise<ConnectionLease> {
    if (this.closed) throw new Error("Turso database connection is closed");
    if (this.recoveryPromise) await this.recoveryPromise;
    if (this.closed) throw new Error("Turso database connection is closed");
    if (
      this.dependencies.now() < this.refreshAt ||
      this.connection.inTransaction ||
      (this.inFlight.get(this.connection) ?? 0) > 0
    ) {
      return this.acquire(this.connection);
    }
    if (!this.refreshPromise) {
      const previous = this.connection;
      this.refreshPromise = (async () => {
        const replacement = await openConnection(
          this.url,
          this.databaseName,
          this.dependencies,
        );
        await this.waitForIdle(previous);
        if (this.closed) {
          await replacement.close();
          throw new Error("Turso database connection is closed");
        }

        if (this.connection !== previous || previous.inTransaction) {
          await replacement.close();
          return this.connection;
        }

        this.connection = replacement;
        this.refreshAt =
          this.dependencies.now() + this.dependencies.refreshAfterMs;
        await previous.close().catch(() => undefined);
        return replacement;
      })();
    }

    try {
      return this.acquire(await this.refreshPromise);
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async recoverExpiredSession(): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;

    const previous = this.connection;
    this.recoveryPromise = (async () => {
      await this.waitForIdle(previous);
      if (this.closed) throw new Error("Turso database connection is closed");
      if (previous !== this.connection) return;

      const replacement = await openConnection(
        this.url,
        this.databaseName,
        this.dependencies,
      );
      if (this.closed) {
        await replacement.close();
        throw new Error("Turso database connection is closed");
      }
      if (previous !== this.connection) {
        await replacement.close();
        return;
      }

      this.connection = replacement;
      this.refreshAt =
        this.dependencies.now() + this.dependencies.refreshAfterMs;
      await previous.close().catch(() => undefined);
    })();

    try {
      await this.recoveryPromise;
    } finally {
      this.recoveryPromise = undefined;
    }
  }

  private async runWithSessionRecovery<T>(
    operation: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    let lease: ConnectionLease | undefined = await this.getConnection();

    try {
      return await operation(lease.connection);
    } catch (error) {
      if (!isExpiredTursoSessionError(error)) {
        throw error;
      }

      lease.release();
      lease = undefined;

      console.warn(
        `[Turso SQL ${this.databaseName}] server session expired; replacing connection`,
      );
      await this.recoverExpiredSession();
      throw error;
    } finally {
      lease?.release();
    }
  }

  async exec(sql: string, params?: SqlValue[] | null): Promise<void> {
    await this.runWithSessionRecovery(async (connection) => {
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
        this.runWithSessionRecovery(async (connection) => {
          const statement = await connection.prepare(sql);
          return (await statement.raw().all(values)) as SqlValue[][];
        }),
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const refreshPromise = this.refreshPromise;
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    const recoveryPromise = this.recoveryPromise;
    if (recoveryPromise) await recoveryPromise.catch(() => undefined);
    await this.waitForIdle(this.connection);
    await this.connection.close();
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
  const db = new RotatingTursoAsyncSQLiteDB(
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
