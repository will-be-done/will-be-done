import { Effect } from "effect";

// An observable value. Plain callers and React (useSyncExternalStore) use the
// synchronous get/set/subscribe; Effect code waits with `waitFor`.
export class State<T> {
  private value: T;
  private listeners = new Set<(value: T) => void>();

  constructor(value: T) {
    this.value = value;
  }

  get() {
    return this.value;
  }

  set(value: T) {
    this.value = value;
    for (const listener of [...this.listeners]) listener(value);
  }

  modify(modifier: (value: T) => T) {
    this.set(modifier(this.value));
  }

  subscribe(listener: (value: T) => void, emitImmediately = false) {
    this.listeners.add(listener);
    if (emitImmediately) listener(this.value);
    return () => {
      this.listeners.delete(listener);
    };
  }

  waitFor<A extends T>(predicate: (value: T) => value is A): Effect.Effect<A>;
  waitFor(predicate: (value: T) => boolean): Effect.Effect<T>;
  waitFor(predicate: (value: T) => boolean): Effect.Effect<T> {
    return Effect.callback<T>((resume) => {
      let settled = false;
      const check = (value: T) => {
        if (settled || !predicate(value)) return;
        settled = true;
        unsubscribe();
        // Resuming inside set() would run the waiter in the setter's stack.
        queueMicrotask(() => resume(Effect.succeed(value)));
      };
      const unsubscribe = this.subscribe(check);
      check(this.value);
      return Effect.sync(unsubscribe);
    });
  }
}
