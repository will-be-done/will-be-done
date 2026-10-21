import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTRPC } from "@/lib/trpc";
import { authUtils } from "@/lib/auth";
import {
  clearAccountEmailToken,
  getAccountEmailToken,
} from "@/lib/accountEmailToken";
import { BackgroundOrbs } from "@/components/Layout/BackgroundOrbs";

const inputClass =
  "mt-2 block w-full rounded-md bg-white/[0.05] px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-blue-500";
const buttonClass =
  "w-full cursor-pointer rounded-lg bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

export function AccountEmailPage({
  mode,
}: {
  mode: "verify" | "forgot" | "reset";
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const config = useQuery(trpc.getAuthConfig.queryOptions());
  const [token] = useState(() =>
    getAccountEmailToken(
      mode === "verify" ? "/verify-email" : "/reset-password",
    ),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const verify = useMutation(
    trpc.verifyEmail.mutationOptions({
      onSuccess: async () => {
        clearAccountEmailToken();
        await queryClient.invalidateQueries({
          queryKey: trpc.getAccount.queryKey(),
        });
      },
    }),
  );
  const forgot = useMutation(trpc.requestPasswordReset.mutationOptions());
  const reset = useMutation(
    trpc.resetPassword.mutationOptions({
      onSuccess: (result) => {
        clearAccountEmailToken();
        if (authUtils.getUserId() === result.userId) authUtils.signOut();
      },
    }),
  );
  const mutation =
    mode === "verify" ? verify : mode === "forgot" ? forgot : reset;
  const title =
    mode === "verify"
      ? "Confirm your email"
      : mode === "forgot"
        ? "Forgot your password?"
        : "Reset your password";

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "verify") verify.mutate({ token });
    else if (mode === "forgot") forgot.mutate({ email });
    else if (password !== confirmation) setError("Passwords do not match.");
    else reset.mutate({ token, password });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0a0a0f] px-6 py-12 text-slate-100">
      <BackgroundOrbs
        topOrbFill="rgb(37 99 235 / 0.08)"
        bottomOrbFill="rgb(99 102 241 / 0.06)"
      />
      <main className="relative w-full max-w-md">
        <p className="mb-3 text-center text-sm font-semibold text-blue-400">
          Will Be Done
        </p>
        <h1 className="mb-8 text-center text-2xl font-bold">{title}</h1>
        <div className="rounded-lg bg-white/[0.03] p-8 ring-1 ring-white/[0.06]">
          {mutation.isSuccess ? (
            <div
              role="status"
              className="space-y-4 text-sm leading-6 text-slate-300"
            >
              <p>
                {mode === "verify"
                  ? "Your email is confirmed. Your welcome email is on its way."
                  : mode === "forgot"
                    ? "If an account exists for this address, a reset link will arrive shortly. Check your inbox and spam folder. You can request another link after a minute."
                    : "Your password has been changed. All previous login and API tokens have been revoked. Sign in with your new password."}
              </p>
              {mode === "verify" && authUtils.isAuthenticated() ? (
                <Link className="text-blue-400" to="/spaces">
                  Continue to the app
                </Link>
              ) : (
                <Link className="text-blue-400" to="/login">
                  Go to sign in
                </Link>
              )}
            </div>
          ) : config.isPending ? (
            <p role="status">Loading…</p>
          ) : config.isError ? (
            <p role="alert">
              Could not connect to the server. Please try again.
            </p>
          ) : !config.data.emailEnabled ? (
            <p role="alert">Email is not configured on this server.</p>
          ) : mode !== "forgot" && !token ? (
            <div className="space-y-4 text-sm text-slate-300">
              <p role="alert">
                This link is missing or no longer available. Open the link from
                your email again, or request a new one.
              </p>
              {mode === "reset" ? (
                <Link className="text-blue-400" to="/forgot-password">
                  Request a new reset link
                </Link>
              ) : (
                <Link className="text-blue-400" to="/spaces">
                  Open the app to request a new confirmation email
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {mode === "verify" && (
                <p className="text-sm leading-6 text-slate-300">
                  Confirm this email address for your Will Be Done account. This
                  will not change which account is signed in on this device.
                </p>
              )}
              {mode === "forgot" && (
                <label className="block text-sm">
                  Email address
                  <input
                    className={inputClass}
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {mode === "reset" && (
                <>
                  <label className="block text-sm">
                    New password
                    <input
                      className={inputClass}
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={1024}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    Confirm new password
                    <input
                      className={inputClass}
                      type="password"
                      name="confirmation"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={1024}
                      required
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                </>
              )}
              {(error || mutation.error) && (
                <div
                  role="alert"
                  className="rounded-md bg-red-500/10 p-3 text-sm text-red-300"
                >
                  {error || mutation.error?.message}
                </div>
              )}
              {mutation.error && mode !== "forgot" && (
                <p className="text-sm">
                  <Link
                    className="text-blue-400"
                    to={mode === "reset" ? "/forgot-password" : "/spaces"}
                  >
                    {mode === "reset"
                      ? "Request a new reset link"
                      : "Open the app to request a new confirmation email"}
                  </Link>
                </p>
              )}
              <button
                className={buttonClass}
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending
                  ? "Please wait…"
                  : mode === "verify"
                    ? "Confirm email"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Set new password"}
              </button>
            </form>
          )}
        </div>
        {!mutation.isSuccess && (
          <p className="mt-6 text-center text-sm">
            <Link className="text-blue-400" to="/login">
              Back to sign in
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
