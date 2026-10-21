import { createFileRoute } from "@tanstack/react-router";
import { AccountEmailPage } from "@/components/Auth/AccountEmailPage";

export const Route = createFileRoute("/reset-password")({
  component: () => <AccountEmailPage mode="reset" />,
});
