import { Effect, Exit, Scope } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestLogger } from "@/services/testing";
import { scheduleMaintenance } from "./maintenance";

afterEach(() => {
  vi.useRealTimers();
});

describe("store maintenance", () => {
  it("runs after the initial delay, then every minute, until the store closes", async () => {
    vi.useFakeTimers();
    let runs = 0;
    const scope = Scope.makeUnsafe();
    Effect.runSync(
      scheduleMaintenance(
        Effect.sync(() => {
          runs += 1;
        }),
        "2 seconds",
      ).pipe(Scope.provide(scope)),
    );

    await vi.advanceTimersByTimeAsync(1_999);
    expect(runs).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toBe(2);

    await Effect.runPromise(Scope.close(scope, Exit.void));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runs).toBe(2);
  });

  it("logs a failed run and keeps the schedule going", async () => {
    vi.useFakeTimers();
    const logger = makeTestLogger();
    let runs = 0;
    const scope = Scope.makeUnsafe();
    Effect.runSync(
      scheduleMaintenance(
        Effect.suspend(() => {
          runs += 1;
          return runs === 1
            ? Effect.die(new Error("trash purge failed"))
            : Effect.void;
        }),
        0,
      ).pipe(Scope.provide(scope), Effect.provide(logger.layer)),
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toBe(2);
    expect(logger.errors()).toEqual([
      {
        level: "Error",
        message: ["Store maintenance failed"],
        failure: new Error("trash purge failed"),
      },
    ]);
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
