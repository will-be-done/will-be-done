import type { DB } from "@will-be-done/hyperdb";
import { Context, Effect, Layer } from "effect";
import { closeDatabases, getMainHyperDB } from "./db";

export class MainDatabase extends Context.Service<MainDatabase, DB>()(
  "@will-be-done/api/MainDatabase",
) {
  // Closing also closes every user and space database opened since.
  static readonly layer = Layer.effect(
    MainDatabase,
    Effect.acquireRelease(Effect.promise(getMainHyperDB), () =>
      Effect.promise(closeDatabases),
    ),
  );
}
