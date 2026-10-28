import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { parse, startOfDay } from "date-fns";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { CalendarPage } from "@/components/Calendar/CalendarPage.tsx";
import { calendarViews } from "@/components/Calendar/calendarModel.ts";

const searchParams = z.object({
  view: z.enum(calendarViews).default("week"),
  projectId: z.string().default("inbox"),
});

export const Route = createFileRoute("/spaces/$spaceId/calendar/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParams),
});

function RouteComponent() {
  const params = Route.useParams();
  const { view, projectId } = Route.useSearch();
  const anchor = useMemo(
    () => startOfDay(parse(params.date, "yyyy-MM-dd", new Date())),
    [params.date],
  );

  return (
    <GlobalLayout>
      <CalendarPage anchor={anchor} view={view} projectId={projectId} />
    </GlobalLayout>
  );
}
