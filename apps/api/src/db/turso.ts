import { createClient as createTursoApiClient } from "@tursodatabase/api";
import {
  connect,
  type Connection,
  type Statement,
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

const DATABASE_TOKEN_EXPIRATION = "1h";
const DATABASE_TOKEN_REFRESH_AFTER_MS = 50 * 60 * 1_000;
const TURSO_DATABASE_NAME_MAX_LENGTH = 56;

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
    private readonly statement: Statement,
    private readonly databaseName: string,
    private readonly sql: string,
  ) {}

  async values(values: SqlValue[]): Promise<SqlValue[][]> {
    console.log(
      `[Turso SQL ${this.databaseName}] execute started: ${normalizeSql(this.sql)}`,
    );
    return (await this.statement.raw().all(values)) as SqlValue[][];
  }

  finalize(): void {
    // Turso serverless statements do not own native resources.
  }
}

type ConnectionFactory = (url: string, authToken: string) => Connection;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function isExpiredTursoSessionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("HTTP error! status: 404")
  );
}

export type TursoDriverDependencies = {
  createToken: (databaseName: string) => Promise<string>;
  connect: ConnectionFactory;
  now: () => number;
  refreshAfterMs: number;
};

const defaultDriverDependencies = (): TursoDriverDependencies => {
  const env = getEnvConfig();
  const client = createTursoApiClient({
    org: env.WBD_TURSO_ORG!,
    token: env.WBD_TURSO_PLATFORM_TOKEN!,
  });

  return {
    createToken: async (databaseName) => {
      const { jwt } = await client.databases.createToken(databaseName, {
        authorization: "full-access",
        expiration: DATABASE_TOKEN_EXPIRATION,
      });
      return jwt;
    },
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
      await connection.exec("SELECT 1");
      await connection.exec("PRAGMA foreign_keys = ON");
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

  private async getConnection(): Promise<Connection> {
    if (this.closed) throw new Error("Turso database connection is closed");
    if (
      this.dependencies.now() < this.refreshAt ||
      this.connection.inTransaction
    ) {
      return this.connection;
    }
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const replacement = await openConnection(
        this.url,
        this.databaseName,
        this.dependencies,
      );
      if (this.closed) {
        await replacement.close();
        throw new Error("Turso database connection is closed");
      }

      const previous = this.connection;
      this.connection = replacement;
      this.refreshAt =
        this.dependencies.now() + this.dependencies.refreshAfterMs;
      await previous.close().catch(() => undefined);
      return replacement;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async runWithSessionRetry<T>(
    connection: Connection,
    operation: () => Promise<T>,
  ): Promise<T> {
    const wasInTransaction = connection.inTransaction;

    try {
      return await operation();
    } catch (error) {
      if (wasInTransaction || !isExpiredTursoSessionError(error)) throw error;

      console.warn(
        `[Turso SQL ${this.databaseName}] server session expired; reconnecting`,
      );
      await connection.reconnect();
      await connection.exec("PRAGMA foreign_keys = ON");
      return operation();
    }
  }

  async exec(sql: string, params?: SqlValue[] | null): Promise<void> {
    console.log(
      `[Turso SQL ${this.databaseName}] exec started: ${normalizeSql(sql)}`,
    );
    const connection = await this.getConnection();
    await this.runWithSessionRetry(connection, async () => {
      if (params && params.length > 0) {
        const statement = await connection.prepare(sql);
        await statement.run(params);
        return;
      }
      await connection.exec(sql);
    });
  }

  async prepare(sql: string): Promise<AsyncSQLStatement> {
    console.log(
      `[Turso SQL ${this.databaseName}] prepare started: ${normalizeSql(sql)}`,
    );
    const connection = await this.getConnection();
    return new TursoAsyncStatement(
      await this.runWithSessionRetry(connection, () =>
        connection.prepare(sql),
      ),
      this.databaseName,
      sql,
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const refreshPromise = this.refreshPromise;
    if (refreshPromise) await refreshPromise.catch(() => undefined);
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
