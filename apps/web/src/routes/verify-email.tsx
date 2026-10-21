import { createFileRoute } from "@tanstack/react-router";
import { AccountEmailPage } from "@/components/Auth/AccountEmailPage";

export const Route = createFileRoute("/verify-email")({
  component: () => <AccountEmailPage mode="verify" />,
});
