import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTRPC } from "@/lib/trpc";
import { useGoogleFlow } from "@/hooks/useGoogleFlow";

export function AccountSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const account = useQuery(trpc.getAccount.queryOptions());
  const config = useQuery(trpc.getAuthConfig.queryOptions());
  const google = useGoogleFlow("link");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const disconnect = useMutation(trpc.google.disconnect.mutationOptions());
  const verify = useMutation(trpc.requestEmailVerification.mutationOptions());
  const reset = useMutation(trpc.requestPasswordReset.mutationOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.getAccount.queryKey() });
  const button =
    "cursor-pointer rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50";
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
  return (
    <section
      aria-label="Account settings"
      className="space-y-5 p-6 text-sm text-content"
    >
      <div>
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 break-all">{user.email}</p>
        <p className="mt-1 text-content-tinted">
          {user.emailVerifiedAt ? "Email confirmed" : "Email not confirmed"}
        </p>
      </div>
      {!user.emailVerifiedAt && config.data?.emailEnabled && (
        <button
          className={button}
          disabled={verify.isPending || verify.isSuccess}
          onClick={() =>
            verify.mutate(undefined, {
              onSuccess: () =>
                setMessage("Check your inbox for an email confirmation link."),
            })
          }
        >
          Send email confirmation
        </button>
      )}
      <div className="space-y-3">
        <h3 className="font-semibold">Google</h3>
        <p className="break-all text-content-tinted">
          {user.googleEmail
            ? `Connected as ${user.googleEmail}`
            : "Connect Google to sign in to this account."}
        </p>
        {!user.googleEmail && config.data?.googleEnabled && (
          <button
            className={button}
            disabled={google.busy || !user.hasPassword}
            onClick={() => {
              setMessage("");
              setPassword("");
              void google.start();
            }}
          >
            Connect Google
          </button>
        )}
        {!user.googleEmail && !config.data?.googleEnabled && (
          <p className="text-content-tinted">
            Google sign-in is not configured on this server.
          </p>
        )}
        {google.busy && !google.readyEmail && (
          <p role="status">Choose your Google account in your browser.</p>
        )}
        {google.readyEmail && (
          <p>
            Connect <strong className="break-all">{google.readyEmail}</strong>{" "}
            to <strong className="break-all">{user.email}</strong>? Your app
            email stays the same.
          </p>
        )}
        {(google.readyEmail || user.googleEmail) && user.hasPassword && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
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
            <label className="block">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-white/15 bg-transparent px-3 py-2"
              />
            </label>
            <button
              className={button}
              disabled={
                submitting || (!google.readyEmail && !user.emailVerifiedAt)
              }
            >
              {submitting
                ? "Saving…"
                : google.readyEmail
                  ? "Confirm connection"
                  : "Disconnect Google"}
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
            }}
          >
            Cancel connection
          </button>
        )}
        {user.googleEmail && !user.emailVerifiedAt && (
          <p className="text-content-tinted">
            Confirm your app email before disconnecting Google.
          </p>
        )}
      </div>
      {!user.hasPassword && (
        <div className="space-y-3">
          <p>
            Set a password through email recovery before disconnecting Google.
          </p>
          {config.data?.emailEnabled ? (
            <button
              className={button}
              disabled={reset.isPending || reset.isSuccess}
              onClick={() =>
                reset.mutate(
                  { email: user.email },
                  {
                    onSuccess: () =>
                      setMessage(
                        "Check your inbox for a link to set your password. This signs out your current sessions.",
                      ),
                  },
                )
              }
            >
              Email me a password setup link
            </button>
          ) : (
            <p className="text-content-tinted">
              Email recovery is not configured on this server. Keep Google
              connected to sign in.
            </p>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
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
      <Link to="/spaces" className="inline-block text-content-tinted underline">
        Back to spaces
      </Link>
    </section>
  );
}
