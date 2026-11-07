import type { HyperDB } from "@will-be-done/hyperdb";
import { Context, Effect } from "effect";
import { spaceDBConfig, userDBConfig } from "../db/configs";
import {
  getHyperDB,
  getLoadedHyperDBs,
  getMainHyperDB,
  type DBConfig,
  type LoadedDatabase,
  type OpenedDatabase,
} from "../db/db";

export class Databases extends Context.Service<
  Databases,
  {
    readonly main: Effect.Effect<HyperDB>;
    readonly open: (config: DBConfig) => Effect.Effect<OpenedDatabase>;
    readonly loaded: Effect.Effect<readonly LoadedDatabase[]>;
  }
>()("@will-be-done/api/Databases") {
  // The databases stay open for the process; MainDatabase closes them.
  static readonly make = (mainDB?: HyperDB): Databases["Service"] => ({
    main: mainDB
      ? Effect.succeed(mainDB)
      : Effect.promise(() => getMainHyperDB()),
    open: (config) => Effect.promise(() => getHyperDB(config)),
    loaded: Effect.sync(getLoadedHyperDBs),
  });
}

export const userDatabase = (userId: string) =>
  Databases.use((databases) => databases.open(userDBConfig(userId))).pipe(
    Effect.map(({ db }): HyperDB => db),
  );

export const spaceDatabase = (spaceId: string) =>
  Databases.use((databases) => databases.open(spaceDBConfig(spaceId))).pipe(
    Effect.map(({ db }): HyperDB => db),
  );
