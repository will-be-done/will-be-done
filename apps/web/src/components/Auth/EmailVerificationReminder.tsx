import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { authUtils, isDemoMode } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

export function EmailVerificationReminder() {
  useSyncExternalStore(authUtils.subscribe, authUtils.getSnapshot);
  return <Reminder key={authUtils.getUserId() ?? "signed-out"} />;
}

function Reminder() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const authenticated = authUtils.isAuthenticated();
  const trpc = useTRPC();
  const config = useQuery(
    trpc.getAuthConfig.queryOptions(undefined, { enabled: !isDemoMode() }),
  );
  const account = useQuery(
    trpc.getAccount.queryOptions(undefined, {
      enabled: authenticated && config.data?.emailEnabled === true,
      refetchOnWindowFocus: "always",
    }),
  );
  const [dismissed, setDismissed] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const resend = useMutation(trpc.requestEmailVerification.mutationOptions());
  function handleResend() {
    resend.mutate(undefined, {
      onSuccess: (result) => {
        setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
        setRemaining(result.retryAfterSeconds);
      },
    });
  }
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(
      () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [retryAt]);

  if (
    dismissed ||
    !pathname.startsWith("/spaces") ||
    !authenticated ||
    !config.data?.emailEnabled ||
    !account.data ||
    account.data.emailVerifiedAt
  )
    return null;
  return (
    <aside
      aria-label="Email verification"
      className="fixed top-12 left-1/2 z-[60] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 rounded-lg border border-blue-400/20 bg-[#151d30] px-4 py-3 text-sm text-slate-200 shadow-lg"
    >
      <button
        type="button"
        aria-label="Dismiss email reminder"
        className="float-right ml-2 cursor-pointer text-slate-400 hover:text-white"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <p>
        Confirm your email:{" "}
        <span className="break-all font-medium">{account.data.email}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-slate-400">You can keep using the app.</p>
        <button
          type="button"
          className="cursor-pointer text-blue-300 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={resend.isPending || remaining > 0}
          onClick={handleResend}
        >
          {resend.isPending
            ? "Sending…"
            : remaining
              ? `Resend in ${remaining}s`
              : "Resend confirmation"}
        </button>
      </div>
      {resend.isSuccess && (
        <p role="status" className="mt-1 text-xs">
          {resend.data.queued
            ? "Check your inbox for a confirmation link."
            : resend.data.retryAfterSeconds
              ? "A confirmation email was requested recently. Check your inbox or try again after the countdown."
              : "Your email is already confirmed."}
        </p>
      )}
      {resend.error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {resend.error.message}
        </p>
      )}
    </aside>
  );
}
