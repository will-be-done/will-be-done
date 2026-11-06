import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { authUtils } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import { useTRPC } from "@/lib/trpc";
import { BackgroundOrbs } from "@/components/Layout/BackgroundOrbs";

const searchParams = z.object({
  port: z.coerce.number().int().min(1).max(65535).optional().catch(undefined),
  state: z.string().min(1).max(128).optional().catch(undefined),
});

export const Route = createFileRoute("/cli-auth")({
  component: CliAuthPage,
  validateSearch: zodValidator(searchParams),
});

const buttonClass =
  "flex-1 cursor-pointer rounded-lg px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function CliAuthPage() {
  const { port, state } = Route.useSearch();
  const trpc = useTRPC();

  // The token only ever goes to the loopback listener started by `wbd auth login`.
  const returnToCli = (params: Record<string, string>) => {
    if (!port || !state) return;
    const query = new URLSearchParams({ state, ...params });
    window.location.assign(`http://127.0.0.1:${port}/callback?${query}`);
  };

  const createToken = useMutation(
    trpc.createToken.mutationOptions({
      onSuccess: (created) => returnToCli({ token: created.id }),
    }),
  );

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
        <h1 className="mb-8 text-center text-2xl font-bold">
          Authorize the CLI
        </h1>
        <div className="space-y-6 rounded-lg bg-white/[0.03] p-8 text-sm leading-6 text-slate-300 ring-1 ring-white/[0.06]">
          {!port || !state ? (
            <p role="alert">
              This login link is invalid. Run{" "}
              <code className="text-slate-100">wbd auth login</code> again.
            </p>
          ) : isDemoMode() ? (
            <p role="alert">The CLI is not available in demo mode.</p>
          ) : !authUtils.isAuthenticated() ? (
            <div className="space-y-4">
              <p>
                Sign in to Will Be Done in this browser, then run{" "}
                <code className="text-slate-100">wbd auth login</code> again.
              </p>
              <Link className="text-blue-400" to="/login">
                Go to sign in
              </Link>
            </div>
          ) : createToken.isSuccess ? (
            <p role="status">Returning to the terminal…</p>
          ) : (
            <>
              <p>
                The Will Be Done CLI on this computer is asking for access to
                your account. Approving creates an API token for it, which you
                can revoke later in Space settings → API tokens.
              </p>
              {createToken.isError && (
                <p role="alert" className="text-red-400">
                  {createToken.error.message}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  className={`${buttonClass} bg-white/[0.07] text-slate-200 ring-1 ring-white/12 hover:bg-white/10`}
                  disabled={createToken.isPending}
                  onClick={() => returnToCli({ error: "access_denied" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${buttonClass} bg-blue-500 text-white hover:bg-blue-400`}
                  disabled={createToken.isPending}
                  onClick={() => createToken.mutate()}
                >
                  Authorize
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
