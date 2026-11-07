import type { HyperDB } from "@will-be-done/hyperdb";
import { Context, Effect, Layer } from "effect";
import { spaceDBConfig, userDBConfig } from "../db/configs";
import { getHyperDB, getMainHyperDB } from "../db/db";

export class Databases extends Context.Service<
  Databases,
  {
    readonly main: Effect.Effect<HyperDB>;
    readonly user: (userId: string) => Effect.Effect<HyperDB>;
    readonly space: (spaceId: string) => Effect.Effect<HyperDB>;
  }
>()("@will-be-done/api/Databases") {
  // The databases stay open for the process; MainDatabase closes them.
  static readonly make = (mainDB?: HyperDB): Databases["Service"] => ({
    main: mainDB
      ? Effect.succeed(mainDB)
      : Effect.promise(() => getMainHyperDB()),
    user: (userId) =>
      Effect.promise(() => getHyperDB(userDBConfig(userId))).pipe(
        Effect.map(({ db }) => db),
      ),
    space: (spaceId) =>
      Effect.promise(() => getHyperDB(spaceDBConfig(spaceId))).pipe(
        Effect.map(({ db }) => db),
      ),
  });

  static readonly layer = Layer.succeed(Databases, Databases.make());
}
