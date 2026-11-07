import { BunRuntime } from "@effect/platform-bun";
import { Cause, Effect, Exit, Layer } from "effect";
import { AppLive } from "./app";
import { captureException, closeSentry } from "./instrument";

// runMain interrupts on SIGINT and SIGTERM; SIGQUIT stops the app the same way.
const sigquit = Effect.callback<void>((resume) => {
  const onSignal = () => resume(Effect.void);
  process.once("SIGQUIT", onSignal);
  return Effect.sync(() => process.off("SIGQUIT", onSignal));
});

const main = Layer.launch(AppLive).pipe(
  Effect.onInterrupt(() =>
    Effect.sync(() => console.log("Shutting down gracefully...")),
  ),
  Effect.raceFirst(sigquit),
  Effect.tapCause((cause) =>
    Effect.sync(() => {
      if (!Cause.hasInterruptsOnly(cause))
        captureException(Cause.squash(cause));
    }),
  ),
  Effect.ensuring(Effect.promise(closeSentry)),
);

BunRuntime.runMain(main, {
  // A stopped server always ends the process, even if a library left a handle open.
  teardown: (exit) =>
    process.exit(
      Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause) ? 1 : 0,
    ),
});
