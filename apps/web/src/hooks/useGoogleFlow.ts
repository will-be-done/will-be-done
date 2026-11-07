import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Cause, Data, Effect, Exit, Fiber, Queue, Schedule } from "effect";
import { trpcClient, resetWsClient } from "@/lib/trpc";
import { authUtils } from "@/lib/auth";
import {
  captureWebAnalytics,
  identifyWebAnalyticsUser,
  type GoogleAuthSource,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";

type Flow = {
  id: string;
  secret: string;
  expiresAt: number;
  completion?: string;
};
type ActiveFlow = {
  fiber?: Fiber.Fiber<FlowOutcome, GoogleFlowError>;
  flow?: Flow;
  popup?: Window;
  session: string;
  channel?: BroadcastChannel;
};
type FlowOutcome =
  | { type: "link-ready"; email: string | null }
  | { type: "signed-in"; token: string; userId: string };

class GoogleFlowError extends Data.TaggedError("GoogleFlowError")<{
  readonly reason: "google_error" | "expired" | "request_failed";
  readonly message: string;
}> {}

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;
const DEFAULT_ERROR = "Google sign-in failed. Please try again.";

const session = () =>
  `${authUtils.getUserId() ?? ""}:${authUtils.getToken() ?? ""}`;

const request = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new GoogleFlowError({
        reason: "request_failed",
        message: cause instanceof Error ? cause.message : DEFAULT_ERROR,
      }),
  });

const cancelRemoteFlow = (flow: Flow | undefined) => {
  if (!flow) return;
  void trpcClient.google.cancel.mutate(flow).catch(() => {});
  void (window.desktopApi ?? window.api)
    ?.cancelGoogleAuth?.(flow.id)
    .catch(() => {});
};

// Waits for an in-flight begin request so its flow is cancelled too.
export const cancelActiveFlow = (current: ActiveFlow) => {
  current.channel?.close();
  current.popup?.close();
  return Effect.runPromise(
    current.fiber ? Fiber.interrupt(current.fiber) : Effect.void,
  ).then(() => cancelRemoteFlow(current.flow));
};

export const runGoogleFlow = (
  intent: "signin" | "link",
  desktop: Window["desktopApi"],
  current: ActiveFlow,
) =>
  Effect.gen(function* () {
    // Interrupting before the flow id is recorded would leave it open on the server.
    const flow: Flow & { launchUrl: string } = yield* request(() =>
      intent === "link"
        ? trpcClient.google.beginLink.mutate({ desktop: Boolean(desktop) })
        : trpcClient.google.beginSignIn.mutate({ desktop: Boolean(desktop) }),
    ).pipe(
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
      const completion = yield* request<string | null>(() =>
        runGoogleAuth(flow.launchUrl),
      );
      if (!completion) {
        // Without the returned code this flow can never become ready.
        const result = yield* request(() =>
          trpcClient.google.poll.mutate({ id: flow.id, secret: flow.secret }),
        );
        return yield* new GoogleFlowError({
          reason: "google_error",
          message: result.error ?? DEFAULT_ERROR,
        });
      }
      flow.completion = completion;
    } else if (current.popup) {
      const popup = current.popup;
      if (typeof BroadcastChannel !== "undefined") {
        current.channel = new BroadcastChannel(`wbd-google-${flow.id}`);
        current.channel.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data !== "complete") return;
          // The notification only wakes polling. The server still verifies
          // the flow proof before returning a result or issuing credentials.
          popup.close();
          window.focus();
          Queue.offerUnsafe(pollWake, undefined);
        };
      }
      popup.location.href = flow.launchUrl;
    }

    const poll = request(() =>
      trpcClient.google.poll.mutate({
        id: flow.id,
        secret: flow.secret,
        completion: flow.completion,
      }),
    ).pipe(
      Effect.retry({
        times: MAX_CONSECUTIVE_POLL_FAILURES - 1,
        schedule: Schedule.spaced(POLL_INTERVAL_MS),
      }),
    );
    while (Date.now() < flow.expiresAt) {
      const result = yield* poll;
      if (result.status === "error") {
        return yield* new GoogleFlowError({
          reason: "google_error",
          message: result.error ?? DEFAULT_ERROR,
        });
      }
      if (result.status === "ready") {
        current.channel?.close();
        current.popup?.close();
        if (intent === "link") {
          return { type: "link-ready", email: result.email } as const;
        }
        // Another tab may have signed in or out while the user was at Google.
        if (session() !== current.session) return yield* Effect.interrupt;
        const credentials = yield* request(() =>
          trpcClient.google.completeSignIn.mutate({
            id: flow.id,
            secret: flow.secret,
            completion: flow.completion,
          }),
        );
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
  });

export function useGoogleFlow(
  intent: "signin" | "link",
  source: GoogleAuthSource,
) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [readyEmail, setReadyEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = useRef<ActiveFlow | null>(null);

  const cancel = useCallback(() => {
    const current = active.current;
    active.current = null;
    if (current) void cancelActiveFlow(current);
    setBusy(false);
    setReadyEmail(null);
  }, []);

  useEffect(() => {
    let previous = session();
    const sessionChanged = () => {
      const next = session();
      if (previous !== next) cancel();
      previous = next;
    };
    const unsubscribe = authUtils.subscribe(sessionChanged);
    window.addEventListener("storage", sessionChanged);
    return () => {
      window.removeEventListener("storage", sessionChanged);
      unsubscribe();
      cancel();
    };
  }, [cancel]);

  async function start() {
    cancel();
    setError("");
    captureWebAnalytics({
      name: "google_auth_started",
      properties: { source },
    });
    const desktop = window.desktopApi ?? window.api;
    const popup = desktop
      ? undefined
      : (window.open("about:blank", "_blank") ?? undefined);
    if (!desktop && !popup) {
      setError("Allow popups to continue with Google, then try again.");
      captureWebAnalytics({
        name: "google_auth_failed",
        properties: { source, reason: "popup_blocked" },
      });
      return;
    }
    if (popup) popup.opener = null;
    const current: ActiveFlow = { popup, session: session() };
    const fiber = Effect.runFork(runGoogleFlow(intent, desktop, current));
    current.fiber = fiber;
    active.current = current;
    setBusy(true);

    const exit = await Effect.runPromise(Fiber.await(fiber));
    if (active.current !== current) return;
    if (Exit.isSuccess(exit)) {
      const outcome = exit.value;
      if (outcome.type === "link-ready") {
        setReadyEmail(outcome.email);
        return;
      }
      if (session() !== current.session) {
        cancel();
        return;
      }
      active.current = null;
      queryClient.clear();
      authUtils.setToken(outcome.token);
      authUtils.setUserId(outcome.userId);
      resetWsClient();
      identifyWebAnalyticsUser(outcome.userId);
      setBusy(false);
      void navigate({ to: "/spaces" });
      return;
    }
    cancel();
    if (Cause.hasInterruptsOnly(exit.cause)) return;
    const failure = Cause.squash(exit.cause);
    captureWebAnalytics({
      name: "google_auth_failed",
      properties: {
        source,
        reason:
          failure instanceof GoogleFlowError
            ? failure.reason
            : "request_failed",
      },
    });
    setError(failure instanceof Error ? failure.message : DEFAULT_ERROR);
  }

  async function completeLink(password: string) {
    const current = active.current;
    if (!current?.flow || !readyEmail) return false;
    setError("");
    try {
      await trpcClient.google.completeLink.mutate({
        id: current.flow.id,
        secret: current.flow.secret,
        completion: current.flow.completion,
        password,
      });
      if (active.current !== current) return false;
      active.current = null;
      setBusy(false);
      setReadyEmail(null);
      return true;
    } catch (cause) {
      if (active.current === current)
        setError(
          cause instanceof Error ? cause.message : "Could not connect Google.",
        );
      return false;
    }
  }
  return {
    busy,
    readyEmail,
    error,
    start,
    cancel,
    completeLink,
  };
}
