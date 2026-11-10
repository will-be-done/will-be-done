import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarSection } from "@/components/SpaceSettings/CalendarSection";
import { isDemoMode } from "@/lib/demoMode";

export const Route = createFileRoute("/spaces/$spaceId/settings/calendars")({
  beforeLoad: ({ params }) => {
    if (isDemoMode()) {
      throw redirect({ to: "/spaces/$spaceId/settings/general", params });
    }
  },
  component: CalendarSection,
});
