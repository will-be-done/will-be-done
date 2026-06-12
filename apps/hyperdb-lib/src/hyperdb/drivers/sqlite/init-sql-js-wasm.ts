import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SqlDriver, type SQLStatement } from "./sql-driver";
import type { SqlValue } from "./sqlite-common";
import { normalizeWasmUrl } from "./wasm-url";

export async function initSqlJsWasm() {
  try {
    // Try to use sql.js directly (works in Node.js with proper setup)
    const SQL = await initSqlJs({
      locateFile: () => normalizeWasmUrl(wasmUrl),
    });

    const sqldb = new SQL.Database();

    return new SqlDriver({
      exec(sql: string, params: SqlValue[]): void {
        sqldb.exec(sql, params);
      },
      prepare(sql: string): SQLStatement {
        const prepared = sqldb.prepare(sql);

        return {
          values(values: SqlValue[]): SqlValue[][] {
            prepared.bind(values);

            const result: SqlValue[][] = [];
            while (prepared.step()) {
              result.push(prepared.get());
            }

            return result;
          },
          finalize(): void {
            prepared.free();
          },
        };
      },
    });
  } catch (error) {
    console.error(error);
    throw new Error(
      "sql.js is required but not available. Use HyperDBSQLite.create() for proper async initialization.",
    );
  }
}
