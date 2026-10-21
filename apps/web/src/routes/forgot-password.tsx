import { createFileRoute } from "@tanstack/react-router";
import { AccountEmailPage } from "@/components/Auth/AccountEmailPage";

export const Route = createFileRoute("/forgot-password")({
  component: () => <AccountEmailPage mode="forgot" />,
});
