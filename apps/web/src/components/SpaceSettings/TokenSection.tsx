import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { authUtils } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

function maskedToken(token: string) {
  return `${"•".repeat(24)}${token.slice(-8)}`;
}

export function TokenSection() {
  const trpc = useTRPC();
  const currentToken = authUtils.getToken();
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(
    () => new Set(),
  );
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const tokensQuery = useQuery(trpc.listTokens.queryOptions());

  const createMutation = useMutation(
    trpc.createToken.mutationOptions({
      onSuccess: async (created) => {
        setRevealedTokens((tokens) => new Set(tokens).add(created.id));
        await tokensQuery.refetch();
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.deleteToken.mutationOptions({
      onSuccess: async (_result, { tokenId }) => {
        if (tokenId === currentToken) {
          authUtils.signOut();
          window.location.assign("/login");
          return;
        }

        setRevealedTokens((tokens) => {
          const next = new Set(tokens);
          next.delete(tokenId);
          return next;
        });
        await tokensQuery.refetch();
      },
    }),
  );

  const toggleToken = (tokenId: string) => {
    setRevealedTokens((tokens) => {
      const next = new Set(tokens);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  };

  const copyToken = async (tokenId: string) => {
    try {
      await navigator.clipboard.writeText(tokenId);
      setCopyError(null);
      setCopiedToken(tokenId);
      window.setTimeout(() => {
        setCopiedToken((copied) => (copied === tokenId ? null : copied));
      }, 1_500);
    } catch {
      setCopyError("Could not copy the token. Please copy it manually.");
    }
  };

  const deleteToken = (tokenId: string) => {
    const isCurrent = tokenId === currentToken;
    const confirmed = window.confirm(
      isCurrent
        ? "Delete the token for this session? You will be signed out."
        : "Delete this token? Apps using it will immediately lose access.",
    );
    if (confirmed) {
      deleteMutation.mutate({ tokenId });
    }
  };

  const error =
    copyError ??
    createMutation.error?.message ??
    deleteMutation.error?.message ??
    tokensQuery.error?.message;

  return (
    <div className="flex flex-col gap-3 px-5 py-5">
      <div className="rounded-xl bg-overlay p-4 ring-1 ring-border">
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="float-right ml-3 mb-1 flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-overlay-hover px-3 py-2 text-[12px] font-medium text-content ring-1 ring-border transition-all hover:bg-overlay-hover hover:ring-border disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createMutation.isPending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Create token
        </button>
        <div className="float-left mt-0.5 mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-overlay text-content-tinted ring-1 ring-border">
          <KeyRound className="h-4 w-4" />
        </div>
        <h3 className="text-[13px] font-semibold text-content">API tokens</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-content-tinted">
          Use tokens to access the API from scripts and integrations. Treat them
          like passwords.{" "}
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-content/70 underline underline-offset-2 transition-colors hover:text-content"
          >
            API documentation
          </a>
          .
        </p>
        <div className="clear-both" />

        {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl bg-overlay ring-1 ring-border">
        <div className="border-b border-white/8 px-4 py-3">
          <h3 className="text-[12px] font-semibold text-content">
            Active tokens
          </h3>
        </div>

        {tokensQuery.isPending ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-content-tinted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading tokens…
          </div>
        ) : tokensQuery.data?.length ? (
          <div className="divide-y divide-white/8">
            {tokensQuery.data.map((token) => {
              const isRevealed = revealedTokens.has(token.id);
              const isCurrent = token.id === currentToken;
              const isDeleting =
                deleteMutation.isPending &&
                deleteMutation.variables?.tokenId === token.id;

              return (
                <div
                  key={token.id}
                  className="grid grid-cols-1 gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code
                        className="block min-w-0 truncate font-mono text-[11px] text-content"
                        title={isRevealed ? token.id : undefined}
                      >
                        {isRevealed ? token.id : maskedToken(token.id)}
                      </code>
                      {isCurrent && (
                        <span className="flex-shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-content-tinted/70">
                      Created{" "}
                      {format(new Date(token.createdAt), "MMM d, yyyy, h:mm a")}
                    </p>
                  </div>

                  <dl className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[10px] leading-4 text-content-tinted/70 sm:col-start-1 sm:row-start-2">
                    <dt>Last used</dt>
                    <dd className="min-w-0 truncate text-content-tinted">
                      {token.lastUsedAt
                        ? format(
                            new Date(token.lastUsedAt),
                            "MMM d, yyyy, h:mm a",
                          )
                        : "Never"}
                    </dd>
                    <dt>IP</dt>
                    <dd
                      className="min-w-0 truncate font-mono text-content-tinted"
                      title={token.lastUsedIp}
                    >
                      {token.lastUsedIp ?? "Unavailable"}
                    </dd>
                    <dt>Agent</dt>
                    <dd
                      className="min-w-0 truncate text-content-tinted"
                      title={token.lastUsedUserAgent}
                    >
                      {token.lastUsedUserAgent ?? "Unavailable"}
                    </dd>
                  </dl>

                  <div className="flex items-center justify-self-start self-start gap-1 sm:col-start-2 sm:row-start-1 sm:justify-self-end">
                    <button
                      type="button"
                      aria-label={isRevealed ? "Hide token" : "Show token"}
                      title={isRevealed ? "Hide token" : "Show token"}
                      onClick={() => toggleToken(token.id)}
                      className="cursor-pointer rounded-lg p-2 text-content-tinted/60 transition-colors hover:bg-overlay hover:text-content"
                    >
                      {isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Copy token"
                      title="Copy token"
                      onClick={() => void copyToken(token.id)}
                      className="cursor-pointer rounded-lg p-2 text-content-tinted/60 transition-colors hover:bg-overlay hover:text-content"
                    >
                      {copiedToken === token.id ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete token"
                      title="Delete token"
                      onClick={() => deleteToken(token.id)}
                      disabled={isDeleting}
                      className="cursor-pointer rounded-lg p-2 text-content-tinted/60 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[12px] text-content-tinted">
            No active tokens.
          </p>
        )}
      </div>
    </div>
  );
}
