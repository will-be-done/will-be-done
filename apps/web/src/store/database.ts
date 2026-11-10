import {
  asyncDispatch,
  execAsync,
  execMaybeAsync,
  selectAsync,
  type AnyObjectSelector,
  type HyperDB,
  type SelectorReturn,
  type SelectorRunInput,
  type SubscribableDB,
  type ActionGenerator,
} from "@will-be-done/hyperdb";
import { withoutUndo } from "@will-be-done/hyperdb/undo";
import { Context, Data, Effect, Layer } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly cause: unknown;
}> {}

type Action<A> = ActionGenerator<A>;

type PreloadInput = Parameters<SubscribableDB["preloadTables"]>[0];

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new DatabaseError({ cause }),
  });

export type DispatchOptions = {
  readonly skipSync?: boolean;
  // Marks a merge of changes received from another tab, so the write is not
  // published back to the tabs.
  readonly fromOtherTab?: boolean;
};

const make = <DB extends HyperDB>(hyperDB: DB) => {
  const target = (options: DispatchOptions | undefined) => {
    const traits = [
      ...(options?.skipSync ? [{ type: "skip-sync" }] : []),
      ...(options?.fromOtherTab ? [{ type: "cross-tab" }] : []),
    ];
    return traits.length > 0 ? hyperDB.withTraits(...traits) : hyperDB;
  };
  return {
    // For HyperDB APIs that are not promises: hooks, undo, subscriptions.
    hyperDB,
    // Once a transaction starts it runs to completion, even if the caller is
    // interrupted. `skipSync` writes produce no change records to upload.
    dispatch: <A>(
      action: Action<A>,
      options?: DispatchOptions,
    ): Effect.Effect<A, DatabaseError> =>
      attempt(() => asyncDispatch(target(options), action)).pipe(
        Effect.uninterruptible,
      ),
    // withoutUndo only covers work that starts synchronously, so every action
    // is started inside it before any of them is awaited.
    dispatchWithoutUndo: (
      actions: ReadonlyArray<Action<unknown>>,
    ): Effect.Effect<void, DatabaseError> =>
      attempt(() =>
        Promise.all(
          withoutUndo(hyperDB, (scoped) =>
            actions.map((action) => asyncDispatch(scoped, action)),
          ),
        ),
      ).pipe(Effect.asVoid, Effect.uninterruptible),
    select: <TSelector extends AnyObjectSelector>(
      input: SelectorRunInput<TSelector>,
    ): Effect.Effect<SelectorReturn<TSelector>, DatabaseError> =>
      attempt(() => selectAsync(hyperDB, input)),
    preload: (tables: PreloadInput): Effect.Effect<void, DatabaseError> =>
      attempt(() => execAsync(hyperDB.preloadTables(tables))),
    // Completes at once when nothing is waiting to be written.
    waitForPersistence: Effect.suspend(() => {
      if (!hyperDB.waitForPersistence) return Effect.void;
      const persisted = execMaybeAsync(hyperDB.waitForPersistence());
      return persisted instanceof Promise
        ? attempt(() => persisted)
        : Effect.void;
    }),
  };
};

export class Database extends Context.Service<
  Database,
  ReturnType<typeof make<SubscribableDB>>
>()("@will-be-done/web/Database") {
  static readonly make = make;
  static readonly layer = (hyperDB: SubscribableDB) =>
    Layer.succeed(Database, make(hyperDB));
}
