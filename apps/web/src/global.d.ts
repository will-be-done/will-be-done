import { Compilable } from "kysely";

declare module "@kikko-land/kikko" {
  export interface IDb {
    runQuery<D>(query: Compilable<D>): Promise<D[]>;
  }
}
