import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
const session = () =>
  `${authUtils.getUserId() ?? ""}:${authUtils.getToken() ?? ""}`;

export function useGoogleFlow(
  intent: "signin" | "link",
  source: GoogleAuthSource,
) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [readyEmail, setReadyEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = useRef<{
    flow?: Flow;
    popup?: Window;
    controller: AbortController;
    session: string;
    channel?: BroadcastChannel;
  } | null>(null);

  const cancel = useCallback(() => {
    const current = active.current;
    active.current = null;
    current?.controller.abort();
    current?.channel?.close();
    current?.popup?.close();
    if (current?.flow)
      void trpcClient.google.cancel.mutate(current.flow).catch(() => {});
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
    const current = {
      popup,
      controller: new AbortController(),
      session: session(),
      flow: undefined as Flow | undefined,
      channel: undefined as BroadcastChannel | undefined,
    };
    active.current = current;
    setBusy(true);
    let failure: "google_error" | "expired" | "request_failed" =
      "request_failed";
    try {
      const flow: Flow & { launchUrl: string } =
        intent === "link"
          ? await trpcClient.google.beginLink.mutate({
              desktop: Boolean(desktop),
            })
          : await trpcClient.google.beginSignIn.mutate({
              desktop: Boolean(desktop),
            });
      current.flow = flow;
      if (active.current !== current) {
        void trpcClient.google.cancel.mutate(flow).catch(() => {});
        return;
      }
      if (desktop) {
        if (!desktop.runGoogleAuth)
          throw new Error("Update the desktop app to continue with Google.");
        // Resolves once the browser returns to the app's loopback listener.
        const completion = await desktop.runGoogleAuth(flow.launchUrl);
        if (completion) flow.completion = completion;
        if (active.current !== current) return;
      } else if (popup) {
        if (typeof BroadcastChannel !== "undefined") {
          current.channel = new BroadcastChannel(`wbd-google-${flow.id}`);
          current.channel.onmessage = (event: MessageEvent<unknown>) => {
            if (event.data !== "complete" || active.current !== current) return;
            // The notification only wakes polling. The server still verifies
            // the flow proof before returning a result or issuing credentials.
            popup.close();
            window.focus();
            current.controller.abort();
          };
        }
        popup.location.href = flow.launchUrl;
      }
      let consecutiveFailures = 0;
      while (active.current === current && Date.now() < flow.expiresAt) {
        const result = await trpcClient.google.poll
          .mutate({
            id: flow.id,
            secret: flow.secret,
            completion: flow.completion,
          })
          .then((result) => {
            consecutiveFailures = 0;
            return result;
          })
          .catch((cause: unknown) => {
            if (++consecutiveFailures >= 3) throw cause;
            return { status: "pending" as const, email: null, error: null };
          });
        if (active.current !== current || session() !== current.session) return;
        if (result.status === "error") {
          failure = "google_error";
          throw new Error(
            result.error ?? "Google sign-in failed. Please try again.",
          );
        }
        if (result.status === "ready") {
          current.channel?.close();
          current.popup?.close();
          if (intent === "link") {
            setReadyEmail(result.email);
            return;
          }
          const credentials = await trpcClient.google.completeSignIn.mutate({
            id: flow.id,
            secret: flow.secret,
            completion: flow.completion,
          });
          if (active.current !== current || session() !== current.session)
            return;
          active.current = null;
          queryClient.clear();
          authUtils.setToken(credentials.token);
          authUtils.setUserId(credentials.userId);
          resetWsClient();
          identifyWebAnalyticsUser(credentials.userId);
          setBusy(false);
          void navigate({ to: "/spaces" });
          return;
        }
        await new Promise<void>((resolve) => {
          if (current.controller.signal.aborted) {
            current.controller = new AbortController();
            resolve();
            return;
          }
          const finish = () => {
            clearTimeout(timer);
            current.controller.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, 2000);
          current.controller.signal.addEventListener("abort", finish, {
            once: true,
          });
        });
      }
      if (active.current === current) {
        failure = "expired";
        throw new Error("Google sign-in expired. Please try again.");
      }
    } catch (cause) {
      if (active.current === current) {
        cancel();
        captureWebAnalytics({
          name: "google_auth_failed",
          properties: { source, reason: failure },
        });
        setError(
          cause instanceof Error
            ? cause.message
            : "Google sign-in failed. Please try again.",
        );
      }
    }
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
