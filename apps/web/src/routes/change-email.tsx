import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTRPC } from "@/lib/trpc";
import {
  clearAccountEmailToken,
  getAccountEmailToken,
} from "@/lib/accountEmailToken";
import { StandalonePage } from "@/components/Layout/StandalonePage";

export const Route = createFileRoute("/change-email")({
  component: ChangeEmailPage,
});

function ChangeEmailPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [token] = useState(() => getAccountEmailToken("/change-email"));
  const confirm = useMutation(
    trpc.confirmEmailChange.mutationOptions({
      onSuccess: async () => {
        clearAccountEmailToken();
        await queryClient.invalidateQueries({
          queryKey: trpc.getAccount.queryKey(),
        });
      },
    }),
  );
  return (
    <StandalonePage>
      <div className="mx-auto max-w-md space-y-5 rounded-lg bg-white/[0.03] p-8 text-sm text-slate-300 ring-1 ring-white/[0.06]">
        <h1 className="text-2xl font-bold text-white">
          {confirm.isSuccess ? "Email address changed" : "Confirm email change"}
        </h1>
        {confirm.isSuccess ? (
          <p role="status">
            Your email address has been changed. Check your new inbox for a
            verification link.
          </p>
        ) : !token ? (
          <p role="alert">
            This link is missing or no longer available. Open the link from your
            email again, or request a new one in account settings.
          </p>
        ) : (
          <>
            <p>
              Confirm the email address change you requested. Your new address
              will need to be verified.
            </p>
            <button
              className="w-full cursor-pointer rounded-lg bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate({ token })}
            >
              {confirm.isPending ? "Confirming…" : "Confirm email change"}
            </button>
            {confirm.error && <p role="alert">{confirm.error.message}</p>}
          </>
        )}
        <Link className="inline-block text-blue-400" to="/account">
          Open account settings
        </Link>
      </div>
    </StandalonePage>
  );
}
