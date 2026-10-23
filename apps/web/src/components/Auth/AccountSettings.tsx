import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Mail } from "lucide-react";
import { GoogleMark } from "./GoogleSignIn";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { useTRPC } from "@/lib/trpc";
import { useGoogleFlow } from "@/hooks/useGoogleFlow";

export function AccountSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const account = useQuery(trpc.getAccount.queryOptions());
  const config = useQuery(trpc.getAuthConfig.queryOptions());
  const google = useGoogleFlow("link", "account_settings");
  const [password, setPassword] = useState("");
  const [passwordRequested, setPasswordRequested] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (passwordRequested) passwordInput.current?.focus();
  }, [passwordRequested]);
  const [message, setMessage] = useState("");
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [resetCooldown, setResetCooldown] = useState(0);
  useEffect(() => {
    const verifyTimer = setTimeout(
      () => setVerifyCooldown(0),
      Math.max(0, verifyCooldown - Date.now()),
    );
    const resetTimer = setTimeout(
      () => setResetCooldown(0),
      Math.max(0, resetCooldown - Date.now()),
    );
    return () => {
      clearTimeout(verifyTimer);
      clearTimeout(resetTimer);
    };
  }, [verifyCooldown, resetCooldown]);
  const [submitting, setSubmitting] = useState(false);
  const disconnect = useMutation(trpc.google.disconnect.mutationOptions());
  const verify = useMutation(trpc.requestEmailVerification.mutationOptions());
  const reset = useMutation(trpc.requestPasswordReset.mutationOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.getAccount.queryKey() });
  const button =
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-white/[0.05] px-4 py-2.5 text-[13px] font-medium text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
  const card =
    "space-y-4 rounded-lg bg-white/[0.03] p-5 ring-1 ring-white/[0.06] sm:p-6";
  if (account.isPending)
    return (
      <p role="status" className="p-6">
        Loading your account…
      </p>
    );
  if (account.error)
    return (
      <p role="alert" className="p-6">
        {account.error.message}
      </p>
    );
  const user = account.data;
  const showGoogleAction = user.googleEmail
    ? user.hasPassword
    : config.data?.googleEnabled;
  return (
    <section
      aria-label="Account settings"
      className="space-y-4 text-sm text-slate-300"
    >
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <h2 className="font-semibold text-white">Email address</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${user.emailVerifiedAt ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}
          >
            {user.emailVerifiedAt && (
              <Check className="h-3 w-3" aria-hidden="true" />
            )}
            {user.emailVerifiedAt ? "Email confirmed" : "Email not confirmed"}
          </span>
        </div>
        <p className="break-all text-[15px] text-white">{user.email}</p>
        <ChangeEmailForm
          confirmed={Boolean(user.emailVerifiedAt)}
          emailEnabled={Boolean(config.data?.emailEnabled)}
          hasPassword={user.hasPassword}
          buttonClass={button}
        />
        {!user.emailVerifiedAt && config.data?.emailEnabled && (
          <button
            className={button}
            disabled={verify.isPending || verifyCooldown > 0}
            onClick={() =>
              verify.mutate(undefined, {
                onSuccess: (result) => {
                  setVerifyCooldown(
                    Date.now() + result.retryAfterSeconds * 1000,
                  );
                  setMessage(
                    result.queued
                      ? "Check your inbox for an email confirmation link."
                      : "An email confirmation was recently requested. Please wait before trying again.",
                  );
                },
              })
            }
          >
            Send email confirmation
          </button>
        )}
      </div>
      <div className={card}>
        <div className="flex items-center gap-3">
          <GoogleMark />
          <h2 className="font-semibold text-white">Google</h2>
        </div>
        <p className="break-all text-slate-400">
          {user.googleEmail
            ? `Connected as ${user.googleEmail}`
            : "Connect Google to sign in to this account."}
        </p>
        {!user.googleEmail && !config.data?.googleEnabled && (
          <p className="text-slate-400">
            Google sign-in is not configured on this server.
          </p>
        )}
        {google.busy && !google.readyEmail && (
          <p role="status">Choose your Google account in your browser.</p>
        )}
        {google.confirmationCode && (
          <p role="status">
            Enter this confirmation code in your browser:{" "}
            <strong data-testid="google-confirmation-code">
              {google.confirmationCode}
            </strong>
          </p>
        )}
        {google.readyEmail && (
          <p>
            Connect <strong className="break-all">{google.readyEmail}</strong>{" "}
            to <strong className="break-all">{user.email}</strong>? Your app
            email stays the same.
          </p>
        )}
        {showGoogleAction && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!passwordRequested) {
                setMessage("");
                setPasswordRequested(true);
                return;
              }
              if (!user.googleEmail && !google.readyEmail) {
                setMessage("");
                void google.start();
                return;
              }
              void (async () => {
                setSubmitting(true);
                setMessage("");
                try {
                  if (google.readyEmail) {
                    if (!(await google.completeLink(password))) return;
                    setMessage(
                      "Google is connected. You can now sign in with Google or your password.",
                    );
                  } else {
                    await disconnect.mutateAsync({ password });
                    setMessage(
                      "Google is disconnected. Sign in with your email and password.",
                    );
                  }
                  setPassword("");
                  setPasswordRequested(false);
                  await refresh();
                } catch {
                  /* The mutation displays its error below. */
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
            className="space-y-3"
          >
            {passwordRequested && (
              <label className="block">
                Password is required to proceed
                <input
                  ref={passwordInput}
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  maxLength={1024}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 block min-h-11 w-full rounded-lg bg-white/[0.05] px-3 py-2 text-white ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
            )}
            <button
              className={button}
              disabled={
                submitting ||
                !user.hasPassword ||
                (google.busy && !google.readyEmail) ||
                Boolean(user.googleEmail && !user.emailVerifiedAt)
              }
            >
              {submitting
                ? "Saving…"
                : google.readyEmail
                  ? "Confirm connection"
                  : user.googleEmail
                    ? "Disconnect Google"
                    : "Connect Google"}
            </button>
          </form>
        )}
        {google.busy && (
          <button
            className={button}
            disabled={submitting}
            onClick={() => {
              google.cancel();
              setPassword("");
              setPasswordRequested(false);
            }}
          >
            Cancel connection
          </button>
        )}
        {user.googleEmail && !user.emailVerifiedAt && (
          <p className="text-slate-400">
            Confirm your app email before disconnecting Google.
          </p>
        )}
      </div>
      {!user.hasPassword && (
        <div className={card}>
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <h2 className="font-semibold text-white">Password</h2>
          </div>
          <p className="text-slate-400">
            Set a password through email recovery before disconnecting Google.
          </p>
          {config.data?.emailEnabled ? (
            <button
              className={button}
              disabled={reset.isPending || resetCooldown > 0}
              onClick={() =>
                reset.mutate(
                  { email: user.email },
                  {
                    onSuccess: () => {
                      setResetCooldown(Date.now() + 60_000);
                      setMessage(
                        "Check your inbox for a link to set your password. This signs out your current sessions.",
                      );
                    },
                  },
                )
              }
            >
              Email me a password setup link
            </button>
          ) : (
            <p className="text-slate-400">
              Email recovery is not configured on this server. Keep Google
              connected to sign in.
            </p>
          )}
        </div>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg bg-blue-400/10 px-4 py-3 text-blue-200"
        >
          {message}
        </p>
      )}
      {[
        google.error,
        disconnect.error?.message,
        verify.error?.message,
        reset.error?.message,
      ]
        .filter(Boolean)
        .map((error) => (
          <p role="alert" key={error} className="text-red-300">
            {error}
          </p>
        ))}
    </section>
  );
}
