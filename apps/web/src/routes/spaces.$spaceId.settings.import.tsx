import { createFileRoute } from "@tanstack/react-router";
import { ImportSection } from "@/components/SpaceSettings/ImportSection";

export const Route = createFileRoute("/spaces/$spaceId/settings/import")({
  component: ImportSection,
});
