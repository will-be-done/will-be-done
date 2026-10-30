import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { useAuthFlow } from "@/hooks/useAuthFlow";

export function SsoAccountSettings({
  name,
  email,
  hasPassword,
  buttonClass,
}: {
  name: string;
  email: string | null;
  hasPassword: boolean;
  buttonClass: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const flow = useAuthFlow("link", "account_settings", "oidc");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const disconnect = useMutation(trpc.oidc.disconnect.mutationOptions());
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.getAccount.queryKey() });
  return (
    <div className="space-y-4 rounded-lg bg-white/[0.03] p-5 ring-1 ring-white/[0.06] sm:p-6">
      <h2 className="font-semibold text-white">{name}</h2>
      <p className="break-all text-slate-400">
        {email
          ? `Connected as ${email}`
          : `Connect ${name} to sign in to this account.`}
      </p>
      {flow.busy && !flow.readyEmail && (
        <p role="status">Choose your SSO account in your browser.</p>
      )}
      {flow.readyEmail && (
        <p>
          Connect <strong className="break-all">{flow.readyEmail}</strong> to
          this account? Your app email stays the same.
        </p>
      )}
      {!hasPassword ? (
        <p>
          Set a password through email recovery before{" "}
          {email ? "disconnecting" : "connecting"} SSO.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");
            if (!email && !flow.readyEmail) {
              void flow.start();
              return;
            }
            void (async () => {
              setSaving(true);
              try {
                if (email) await disconnect.mutateAsync({ password });
                else if (!(await flow.completeLink(password))) return;
                setPassword("");
                setMessage(
                  email ? "SSO is disconnected." : "SSO is connected.",
                );
                await refresh();
              } catch {
                /* The mutation displays its error below. */
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          {(email || flow.readyEmail) && (
            <label className="block">
              Current app password
              <input
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
            className={buttonClass}
            disabled={saving || (flow.busy && !flow.readyEmail)}
          >
            {saving
              ? "Saving…"
              : email
                ? "Disconnect SSO"
                : flow.readyEmail
                  ? "Confirm connection"
                  : "Connect SSO"}
          </button>
        </form>
      )}
      {flow.busy && (
        <button
          className={buttonClass}
          disabled={saving}
          onClick={() => {
            flow.cancel();
            setPassword("");
          }}
        >
          Cancel connection
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {(flow.error || disconnect.error) && (
        <p role="alert" className="text-red-300">
          {flow.error || disconnect.error?.message}
        </p>
      )}
    </div>
  );
}
