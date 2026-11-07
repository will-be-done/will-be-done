import {
  Clock,
  Context,
  Data,
  Effect,
  Fiber,
  Queue,
  Schedule,
  Stream,
} from "effect";
import { AuthSession, PageEvents } from "@/services/browser";

export type GoogleFlow = {
  id: string;
  secret: string;
  expiresAt: number;
  completion?: string;
};

type GoogleProof = { id: string; secret: string; completion?: string };

export class GoogleFlowError extends Data.TaggedError("GoogleFlowError")<{
  readonly reason: "google_error" | "expired" | "request_failed";
  readonly message: string;
}> {}

export class GoogleAuthApi extends Context.Service<
  GoogleAuthApi,
  {
    readonly begin: (
      intent: "signin" | "link",
      desktop: boolean,
    ) => Effect.Effect<GoogleFlow & { launchUrl: string }, GoogleFlowError>;
    readonly poll: (proof: GoogleProof) => Effect.Effect<
      {
        status: "pending" | "ready" | "error";
        email: string | null;
        error: string | null;
      },
      GoogleFlowError
    >;
    readonly completeSignIn: (
      proof: GoogleProof,
    ) => Effect.Effect<{ token: string; userId: string }, GoogleFlowError>;
    readonly completeLink: (
      proof: GoogleProof & { password: string },
    ) => Effect.Effect<void, GoogleFlowError>;
    // Closes the flow on the server and stops a desktop browser hand-off.
    readonly cancel: (flow: GoogleFlow) => Effect.Effect<void>;
    // Emits when the popup reports that Google returned to the app.
    readonly completions: (flowId: string) => Stream.Stream<void>;
  }
>()("@will-be-done/web/GoogleAuthApi") {}

export type ActiveGoogleFlow = {
  fiber?: Fiber.Fiber<GoogleFlowOutcome, GoogleFlowError>;
  flow?: GoogleFlow;
  popup?: Window;
  session: string;
};

export type GoogleFlowOutcome =
  | { type: "link-ready"; email: string | null }
  | { type: "signed-in"; token: string; userId: string };

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;
export const DEFAULT_GOOGLE_ERROR = "Google sign-in failed. Please try again.";

export const runGoogleFlow = (
  intent: "signin" | "link",
  desktop: Window["desktopApi"],
  current: ActiveGoogleFlow,
) =>
  Effect.gen(function* () {
    const api = yield* GoogleAuthApi;
    const page = yield* PageEvents;
    const session = yield* AuthSession;
    // Interrupting before the flow id is recorded would leave it open on the server.
    const flow = yield* api.begin(intent, Boolean(desktop)).pipe(
      Effect.tap((flow) =>
        Effect.sync(() => {
          current.flow = flow;
        }),
      ),
      Effect.uninterruptible,
    );

    const pollWake = yield* Queue.dropping<void>(1);
    if (desktop) {
      if (!desktop.runGoogleAuth) {
        return yield* new GoogleFlowError({
          reason: "request_failed",
          message: "Update the desktop app to continue with Google.",
        });
      }
      const runGoogleAuth = desktop.runGoogleAuth;
      // Resolves once the browser returns to the app's loopback listener.
      const completion = yield* Effect.tryPromise({
        try: () => runGoogleAuth(flow.launchUrl),
        catch: (cause) =>
          new GoogleFlowError({
            reason: "request_failed",
            message:
              cause instanceof Error ? cause.message : DEFAULT_GOOGLE_ERROR,
          }),
      });
      if (!completion) {
        // Without the returned code this flow can never become ready.
        const result = yield* api.poll({ id: flow.id, secret: flow.secret });
        return yield* new GoogleFlowError({
          reason: "google_error",
          message: result.error ?? DEFAULT_GOOGLE_ERROR,
        });
      }
      flow.completion = completion;
    } else if (current.popup) {
      const popup = current.popup;
      // The notification only wakes polling. The server still verifies the
      // flow proof before returning a result or issuing credentials.
      yield* api.completions(flow.id).pipe(
        Stream.runForEach(() =>
          Effect.sync(() => {
            popup.close();
            page.focusWindow();
            Queue.offerUnsafe(pollWake, undefined);
          }),
        ),
        // Listen before navigating the popup, so its notice cannot be missed.
        Effect.forkScoped({ startImmediately: true }),
      );
      popup.location.href = flow.launchUrl;
    }

    const poll = api
      .poll({ id: flow.id, secret: flow.secret, completion: flow.completion })
      .pipe(
        Effect.retry({
          times: MAX_CONSECUTIVE_POLL_FAILURES - 1,
          schedule: Schedule.spaced(POLL_INTERVAL_MS),
        }),
      );
    while ((yield* Clock.currentTimeMillis) < flow.expiresAt) {
      const result = yield* poll;
      if (result.status === "error") {
        return yield* new GoogleFlowError({
          reason: "google_error",
          message: result.error ?? DEFAULT_GOOGLE_ERROR,
        });
      }
      if (result.status === "ready") {
        current.popup?.close();
        if (intent === "link") {
          return { type: "link-ready", email: result.email } as const;
        }
        // Another tab may have signed in or out while the user was at Google.
        if ((yield* session.id) !== current.session) {
          return yield* Effect.interrupt;
        }
        const credentials = yield* api.completeSignIn({
          id: flow.id,
          secret: flow.secret,
          completion: flow.completion,
        });
        return { type: "signed-in", ...credentials } as const;
      }
      yield* Effect.raceFirst(
        Effect.sleep(POLL_INTERVAL_MS),
        Queue.take(pollWake),
      );
    }
    return yield* new GoogleFlowError({
      reason: "expired",
      message: "Google sign-in expired. Please try again.",
    });
  }).pipe(Effect.scoped);

// Waits for an in-flight begin request so its flow is cancelled too.
export const cancelActiveFlow = (current: ActiveGoogleFlow) =>
  Effect.gen(function* () {
    current.popup?.close();
    if (current.fiber) yield* Fiber.interrupt(current.fiber);
    if (current.flow) yield* (yield* GoogleAuthApi).cancel(current.flow);
  });
