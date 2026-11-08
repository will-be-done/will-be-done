import { createFileRoute } from "@tanstack/react-router";
import { TokenSection } from "@/components/SpaceSettings/TokenSection";

export const Route = createFileRoute("/spaces/$spaceId/settings/tokens")({
  component: TokenSection,
});
