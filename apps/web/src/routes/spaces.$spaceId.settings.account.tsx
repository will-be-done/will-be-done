import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountSettings } from "@/components/Auth/AccountSettings";
import { isDemoMode } from "@/lib/demoMode";

export const Route = createFileRoute("/spaces/$spaceId/settings/account")({
  beforeLoad: ({ params }) => {
    if (isDemoMode()) {
      throw redirect({ to: "/spaces/$spaceId/settings/general", params });
    }
  },
  component: AccountSettings,
});
