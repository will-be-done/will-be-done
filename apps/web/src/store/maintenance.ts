import { type Duration, Effect, Schedule, type Scope } from "effect";

const MAINTENANCE_INTERVAL = "1 minute";

// Runs `task` after `initialDelay`, then every minute, until the scope
// closes. A failed run is logged and the next one still happens.
export const scheduleMaintenance = (
  task: Effect.Effect<void>,
  initialDelay: Duration.Input,
): Effect.Effect<void, never, Scope.Scope> =>
  task.pipe(
    Effect.catchCause((cause) =>
      Effect.logError("Store maintenance failed", cause),
    ),
    Effect.repeat(Schedule.spaced(MAINTENANCE_INTERVAL)),
    Effect.delay(initialDelay),
    Effect.forkScoped({ startImmediately: true }),
    Effect.asVoid,
  );
