import type { HyperDB } from "@will-be-done/hyperdb";
import { createHlcClock } from "@will-be-done/slices/common";
import { Effect } from "effect";
import type { DBConfig } from "../db/db";
import type { Databases } from "./databases";

type OpenDatabase = (dbId: string) => Effect.Effect<HyperDB>;

const unexpectedDatabase: OpenDatabase = (dbId) =>
  Effect.die(new Error(`Unexpected database open: ${dbId}`));

export const testDatabases = ({
  main,
  user = unexpectedDatabase,
  space = unexpectedDatabase,
}: {
  main: HyperDB;
  user?: OpenDatabase;
  space?: OpenDatabase;
}): Databases["Service"] => ({
  main: Effect.succeed(main),
  open: (config: DBConfig) =>
    (config.dbType === "user" ? user : space)(config.dbId).pipe(
      Effect.map((db) => ({
        dbConfig: config,
        db,
        nextClock: createHlcClock("server"),
        clientId: "server",
      })),
    ),
  loaded: Effect.succeed([]),
});
