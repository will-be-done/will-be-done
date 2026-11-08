import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/components/SpaceSettings/SettingsLayout";

export const Route = createFileRoute("/spaces/$spaceId/settings")({
  component: SettingsLayout,
});
