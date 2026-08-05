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
} from "@will-be-done/hyperdb/drivers/sqlite";
import { getEnvConfig } from "../env";

export type TursoDatabaseType = "user" | "space";
export type TursoDatabaseFileType = "main" | TursoDatabaseType;

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
  dbType: TursoDatabaseFileType,
  dbId: string,
): string {
  const prefix = sanitizeNamePart(prefixValue) || "wbd";
  if (dbType === "main") {
    return `${prefix.slice(0, 59).replace(/-+$/g, "")}-main`;
  }

  const sanitizedId = sanitizeNamePart(dbId);
  const hash = fnv1a64(dbId);
  const rawName = `${prefix}-${dbType}-${sanitizedId || "db"}-${hash}`;
  if (rawName.length <= 64) return rawName;

  const suffix = fnv1a64(rawName);
  const head = rawName
    .slice(0, 64 - suffix.length - 1)
    .replace(/-+$/g, "");
  return `${head}-${suffix}`;
}

export function getTursoDatabaseName(
  dbType: TursoDatabaseType,
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

export async function getOrCreateTursoDatabaseUrl(
  dbType: TursoDatabaseType,
  dbId: string,
): Promise<string> {
  const env = getEnvConfig();
  const client = createTursoApiClient({
    org: env.WBD_TURSO_ORG!,
    token: env.WBD_TURSO_PLATFORM_TOKEN!,
  });
  const name = getTursoDatabaseName(dbType, dbId);

  try {
    const existing = await client.databases.get(name);
    return databaseUrl(existing.hostname);
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }

  try {
    const created = await client.databases.create(name, {
      group: env.WBD_TURSO_GROUP,
    });
    return databaseUrl(created.hostname);
  } catch (error) {
    if (errorStatus(error) !== 409) throw error;
    const existing = await client.databases.get(name);
    return databaseUrl(existing.hostname);
  }
}

class TursoAsyncStatement implements AsyncSQLStatement {
  constructor(private readonly statement: Statement) {}

  async values(values: SqlValue[]): Promise<SqlValue[][]> {
    return (await this.statement.raw().all(values)) as SqlValue[][];
  }

  finalize(): void {
    // Turso serverless statements do not own native resources.
  }
}

class TursoAsyncSQLiteDB implements AsyncSQLiteDB {
  constructor(private readonly connection: Connection) {}

  async exec(sql: string, params?: SqlValue[] | null): Promise<void> {
    if (params && params.length > 0) {
      const statement = await this.connection.prepare(sql);
      await statement.run(params);
      return;
    }
    await this.connection.exec(sql);
  }

  async prepare(sql: string): Promise<AsyncSQLStatement> {
    return new TursoAsyncStatement(await this.connection.prepare(sql));
  }
}

export async function createTursoSqlDriver(url: string): Promise<{
  driver: AsyncSqlDriver;
  close: () => Promise<void>;
}> {
  const connection = connect({
    url: databaseUrl(url),
    authToken: getEnvConfig().WBD_TURSO_AUTH_TOKEN!,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await connection.exec("SELECT 1");
      await connection.exec("PRAGMA foreign_keys = ON");
      return {
        driver: new AsyncSqlDriver(new TursoAsyncSQLiteDB(connection)),
        close: () => connection.close(),
      };
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
