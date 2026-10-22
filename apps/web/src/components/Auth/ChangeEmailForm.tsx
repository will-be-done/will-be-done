import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function ChangeEmailForm({
  confirmed,
  emailEnabled,
  hasPassword,
  buttonClass,
}: {
  confirmed: boolean;
  emailEnabled: boolean;
  hasPassword: boolean;
  buttonClass: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(0), cooldown * 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const change = useMutation(
    trpc.changeEmail.mutationOptions({
      onSuccess: async (result) => {
        setPassword("");
        setCooldown(result.retryAfterSeconds);
        setMessage(
          result.changed
            ? "Your email address has been changed."
            : result.queued
              ? "Check your current email address for a link to confirm this change."
              : "A confirmation was recently requested. Please wait before trying again.",
        );
        if (result.changed || result.queued) {
          setOpen(false);
          setEmail("");
        }
        await queryClient.invalidateQueries({
          queryKey: trpc.getAccount.queryKey(),
        });
      },
    }),
  );
  const unavailable = confirmed ? !emailEnabled : !hasPassword;
  const inputClass =
    "mt-2 block min-h-11 w-full rounded-lg bg-white/[0.05] px-3 py-2 text-white ring-1 ring-white/10 outline-none focus:ring-2 focus:ring-blue-400";
  return (
    <div className="space-y-3">
      {open ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");
            change.mutate({ email, ...(!confirmed ? { password } : {}) });
          }}
        >
          <p className="text-slate-400">
            {confirmed
              ? "Confirm the change through your current email address. You will then need to verify your new address."
              : "Enter your password to change your email address."}
          </p>
          <label className="block">
            New email address
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {!confirmed && (
            <label className="block">
              Current password
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={buttonClass}
              disabled={change.isPending || cooldown > 0 || unavailable}
            >
              {change.isPending
                ? "Saving…"
                : confirmed
                  ? "Send confirmation link"
                  : "Save email"}
            </button>
            <button
              className={buttonClass}
              type="button"
              disabled={change.isPending}
              onClick={() => {
                setOpen(false);
                setPassword("");
                change.reset();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className={buttonClass}
          disabled={unavailable || cooldown > 0}
          onClick={() => {
            setMessage("");
            change.reset();
            setOpen(true);
          }}
        >
          Change email
        </button>
      )}
      {unavailable && (
        <p className="text-slate-400">
          {confirmed
            ? "Email changes require email delivery to be configured on this server."
            : "Set a password before changing your email address."}
        </p>
      )}
      {message && (
        <p role="status" className="text-blue-200">
          {message}
        </p>
      )}
      {change.error && (
        <p role="alert" className="text-red-300">
          {change.error.message}
        </p>
      )}
    </div>
  );
}
