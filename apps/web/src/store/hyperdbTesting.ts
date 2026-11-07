import { noop } from "@will-be-done/hyperdb";

type DBCmd = ReturnType<typeof noop> extends Generator<infer C> ? C : never;

// HyperDB keeps `unwrap` internal and only runs branded commands, so borrow
// the brand from the public `noop` command to suspend a driver on a promise.
export function* waitForPromise<T>(
  promise: Promise<T>,
): Generator<DBCmd, T, unknown> {
  const brand = noop().next().value as DBCmd;
  return (yield { ...brand, type: "unwrap", data: promise } as DBCmd) as T;
}
