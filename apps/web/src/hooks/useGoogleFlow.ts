import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Queue,
  Stream,
} from "effect";
import { trpcClient, resetWsClient } from "@/lib/trpc";
import { authUtils } from "@/lib/auth";
import {
  captureWebAnalytics,
  identifyWebAnalyticsUser,
  type GoogleAuthSource,
} from "@/lib/analytics";
import {
  cancelActiveFlow,
  DEFAULT_GOOGLE_ERROR,
  GoogleAuthApi,
  GoogleFlowError,
  runGoogleFlow,
  type ActiveGoogleFlow,
} from "@/lib/googleFlow";
import { queryClient } from "@/lib/query";
import { AuthSessionLive, PageEventsLive } from "@/services/browserLive";

const call = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new GoogleFlowError({
        reason: "request_failed",
        message: cause instanceof Error ? cause.message : DEFAULT_GOOGLE_ERROR,
      }),
  });

const GoogleAuthApiLive = Layer.succeed(GoogleAuthApi, {
  begin: (intent, desktop) =>
    call(() =>
      intent === "link"
        ? trpcClient.google.beginLink.mutate({ desktop })
        : trpcClient.google.beginSignIn.mutate({ desktop }),
    ),
  poll: (proof) => call(() => trpcClient.google.poll.mutate(proof)),
  completeSignIn: (proof) =>
    call(() => trpcClient.google.completeSignIn.mutate(proof)),
  completeLink: (proof) =>
    Effect.asVoid(call(() => trpcClient.google.completeLink.mutate(proof))),
  cancel: (flow) =>
    Effect.forEach(
      [
        call(() => trpcClient.google.cancel.mutate(flow)),
        call(async () =>
          (window.desktopApi ?? window.api)?.cancelGoogleAuth?.(flow.id),
        ),
      ],
      (request) => Effect.ignore(request),
      { concurrency: "unbounded", discard: true },
    ),
  completions: (flowId) =>
    typeof BroadcastChannel === "undefined"
      ? Stream.never
      : Stream.callback<void>((queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const channel = new BroadcastChannel(`wbd-google-${flowId}`);
              channel.onmessage = (event: MessageEvent<unknown>) => {
                if (event.data === "complete") {
                  Queue.offerUnsafe(queue, undefined);
                }
              };
              return channel;
            }),
            (channel) => Effect.sync(() => channel.close()),
          ),
        ),
});

const googleRuntime = ManagedRuntime.make(
  Layer.mergeAll(GoogleAuthApiLive, AuthSessionLive, PageEventsLive),
);

export function useGoogleFlow(
  intent: "signin" | "link",
  source: GoogleAuthSource,
) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [readyEmail, setReadyEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = useRef<ActiveGoogleFlow | null>(null);

  const cancel = useCallback(() => {
    const current = active.current;
    active.current = null;
    if (current) void googleRuntime.runPromise(cancelActiveFlow(current));
    setBusy(false);
    setReadyEmail(null);
  }, []);

  useEffect(() => {
    let previous = authUtils.sessionId();
    const sessionChanged = () => {
      const next = authUtils.sessionId();
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
    const current: ActiveGoogleFlow = { popup, session: authUtils.sessionId() };
    const fiber = googleRuntime.runFork(
      runGoogleFlow(intent, desktop, current),
    );
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
      if (authUtils.sessionId() !== current.session) {
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
    setError(failure instanceof Error ? failure.message : DEFAULT_GOOGLE_ERROR);
  }

  async function completeLink(password: string) {
    const current = active.current;
    if (!current?.flow || !readyEmail) return false;
    setError("");
    try {
      const flow = current.flow;
      await googleRuntime.runPromise(
        Effect.gen(function* () {
          const api = yield* GoogleAuthApi;
          yield* api.completeLink({
            id: flow.id,
            secret: flow.secret,
            completion: flow.completion,
            password,
          });
        }),
      );
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
