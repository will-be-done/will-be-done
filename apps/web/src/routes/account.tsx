import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { authUtils } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import { ArrowLeft } from "lucide-react";
import { StandalonePage } from "@/components/Layout/StandalonePage";
import { AppLogo } from "@/components/Layout/AppLogo";
import { AccountSettings } from "@/components/Auth/AccountSettings";

export const Route = createFileRoute("/account")({
  beforeLoad: () => {
    if (isDemoMode() || !authUtils.isAuthenticated())
      throw redirect({ to: "/login" });
  },
  component: () => (
    <StandalonePage>
      <Link
        to="/spaces"
        className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-[13px] font-medium text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to spaces
      </Link>
      <div className="mb-8 flex items-center gap-3">
        <AppLogo size={36} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Account settings
          </h1>
          <p className="text-[13px] text-slate-400">
            Manage your email and sign-in methods.
          </p>
        </div>
      </div>
      <div className="max-w-2xl">
        <AccountSettings />
      </div>
    </StandalonePage>
  ),
});
