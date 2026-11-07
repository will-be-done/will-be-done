import { Effect, Fiber } from "effect";
import { describe, expect, it, vi } from "vitest";
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
    const predicate = vi.fn((value: number) => value === 1);
    const fiber = Effect.runFork(state.waitFor(predicate));
    await Effect.runPromise(Fiber.interrupt(fiber));
    const callsBeforeSet = predicate.mock.calls.length;

    state.set(1);

    expect(predicate).toHaveBeenCalledTimes(callsBeforeSet);
  });
});
