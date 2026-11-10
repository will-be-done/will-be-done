import { createFileRoute } from "@tanstack/react-router";
import { GeneralSection } from "@/components/SpaceSettings/GeneralSection";

export const Route = createFileRoute("/spaces/$spaceId/settings/general")({
  component: GeneralSection,
});
