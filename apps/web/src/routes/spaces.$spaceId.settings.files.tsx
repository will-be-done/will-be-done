import { createFileRoute } from "@tanstack/react-router";
import { AttachmentsSection } from "@/components/SpaceSettings/AttachmentsSection";

export const Route = createFileRoute("/spaces/$spaceId/settings/files")({
  component: AttachmentsSection,
});
