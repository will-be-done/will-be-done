import { createFileRoute, redirect } from "@tanstack/react-router";
import { authUtils, isDemoMode } from "@/lib/auth";
import { AccountSettings } from "@/components/Auth/AccountSettings";

export const Route = createFileRoute("/account")({
  beforeLoad: () => {
    if (isDemoMode() || !authUtils.isAuthenticated())
      throw redirect({ to: "/login" });
  },
  component: () => (
    <main className="mx-auto min-h-screen max-w-xl py-10">
      <AccountSettings />
    </main>
  ),
});
