import { Database } from "bun:sqlite";
import {
  TursoServerlessAsyncSqlDriver,
  type TursoServerlessClient,
} from "@will-be-done/hyperdb";

type SqlValue = string | number | bigint | boolean | Uint8Array | null;

type BunSqliteTransaction = {
  execute(input: string | { sql: string; args?: SqlValue[] }): Promise<{
    rows: Array<Record<string, unknown>>;
  }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

class BunSqliteClient implements TursoServerlessClient {
  private activeTx: BunSqliteTransaction | undefined;

  constructor(private db: Database) {}

  async execute(input: string | { sql: string; args?: SqlValue[] }): Promise<{
    rows: Array<Record<string, unknown>>;
  }> {
    const sql = typeof input === "string" ? input : input.sql;
    const args = typeof input === "string" ? [] : (input.args ?? []);

    if (/^\s*select\b/i.test(sql)) {
      return {
        rows: this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>,
      };
    }

    this.db.run(sql, args);
    return { rows: [] };
  }

  async transaction(): Promise<BunSqliteTransaction> {
    if (this.activeTx) {
      throw new Error("can't run while transaction is in progress");
    }

    this.db.run("BEGIN TRANSACTION");

    const tx: BunSqliteTransaction = {
      execute: async (input) => {
        const sql = typeof input === "string" ? input : input.sql;
        const args = typeof input === "string" ? [] : (input.args ?? []);

        if (/^\s*select\b/i.test(sql)) {
          return {
            rows: this.db
              .prepare(sql)
              .all(...args) as Array<Record<string, unknown>>,
          };
        }

        this.db.run(sql, args);
        return { rows: [] };
      },
      commit: async () => {
        this.db.run("COMMIT");
        this.activeTx = undefined;
      },
      rollback: async () => {
        this.db.run("ROLLBACK");
        this.activeTx = undefined;
      },
    };

    this.activeTx = tx;
    return tx;
  }
}

export function createBunSqliteAsyncSqlDriver(
  sqliteDB: Database,
): TursoServerlessAsyncSqlDriver {
  return new TursoServerlessAsyncSqlDriver(new BunSqliteClient(sqliteDB));
}

export function createBunSqliteDatabase(dbPath: string): Database {
  const sqliteDB = new Database(dbPath, { strict: true });

  sqliteDB.run("PRAGMA journal_mode=WAL;");
  sqliteDB.run("PRAGMA synchronous=NORMAL;");
  sqliteDB.run("PRAGMA journal_size_limit=6144000;");
  sqliteDB.run("PRAGMA foreign_keys = ON;");
  sqliteDB.run("PRAGMA busy_timeout=5000;");

  return sqliteDB;
}
