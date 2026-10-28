import { useMemo } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { format, isValid, parse, startOfDay } from "date-fns";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { CalendarPage } from "@/components/Calendar/CalendarPage.tsx";
import { calendarViews } from "@/components/Calendar/calendarModel.ts";

const dateFormat = "yyyy-MM-dd";

const searchParams = z.object({
  view: z.enum(calendarViews).default("week"),
  projectId: z.string().default("inbox"),
});

export const Route = createFileRoute("/spaces/$spaceId/calendar/$date")({
  component: RouteComponent,
  validateSearch: zodValidator(searchParams),
  beforeLoad: ({ params, search }) => {
    if (isValid(parse(params.date, dateFormat, new Date()))) return;
    throw redirect({
      to: "/spaces/$spaceId/calendar/$date",
      params: {
        spaceId: params.spaceId,
        date: format(new Date(), dateFormat),
      },
      search,
      replace: true,
    });
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const { view, projectId } = Route.useSearch();
  const anchor = useMemo(
    () => startOfDay(parse(params.date, dateFormat, new Date())),
    [params.date],
  );

  return (
    <GlobalLayout>
      <CalendarPage anchor={anchor} view={view} projectId={projectId} />
    </GlobalLayout>
  );
}
