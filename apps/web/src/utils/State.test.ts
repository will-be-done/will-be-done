import { Effect, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import { State } from "./State";

describe("State.waitFor", () => {
  it("resolves at once when the current value already matches", async () => {
    const state = new State(3);
    expect(await Effect.runPromise(state.waitFor((value) => value > 2))).toBe(
      3,
    );
  });

  it("resumes after the matching set() returns, not inside it", async () => {
    const state = new State(0);
    const order: string[] = [];
    const waiting = Effect.runPromise(
      state
        .waitFor((value) => value === 2)
        .pipe(
          Effect.tap((value) =>
            Effect.sync(() => order.push(`woke with ${value}`)),
          ),
        ),
    );
    state.set(1);
    state.set(2);
    order.push("set returned");
    state.set(3);

    await waiting;
    expect(order).toEqual(["set returned", "woke with 2"]);
  });

  it("stops listening when interrupted", async () => {
    const state = new State(0);
    let woke = false;
    const fiber = Effect.runFork(
      state
        .waitFor((value) => value === 1)
        .pipe(Effect.tap(() => Effect.sync(() => (woke = true)))),
    );
    await Effect.runPromise(Fiber.interrupt(fiber));
    state.set(1);
    await Promise.resolve();
    expect(woke).toBe(false);
  });
});
