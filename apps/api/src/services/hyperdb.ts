import {
  asyncDispatch,
  selectAsync,
  type AnyObjectSelector,
  type HyperDB,
  type SelectorReturn,
  type SelectorRunInput,
} from "@will-be-done/hyperdb";
import { Effect } from "effect";

// A storage failure is not something a caller can handle, so it is a defect
// that the route turns into a 500.
export const select = <TSelector extends AnyObjectSelector>(
  db: HyperDB,
  input: SelectorRunInput<TSelector>,
): Effect.Effect<SelectorReturn<TSelector>> =>
  Effect.promise(() => selectAsync(db, input));

// Once a transaction starts it runs to completion, even if the caller is
// interrupted.
export const dispatch = <A>(
  db: HyperDB,
  action: Generator<unknown, A, unknown>,
): Effect.Effect<A> =>
  Effect.promise(() => asyncDispatch(db, action)).pipe(Effect.uninterruptible);
