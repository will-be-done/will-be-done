import { createFileRoute } from "@tanstack/react-router";
import { BackupSection } from "@/components/SpaceSettings/BackupSection";

export const Route = createFileRoute("/spaces/$spaceId/settings/backup")({
  component: BackupSection,
});
