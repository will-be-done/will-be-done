import { createFileRoute, redirect } from "@tanstack/react-router";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/spaces/$spaceId/timeline/")({
  loader: (opts) => {
    const date = new Date();

    const startWeekDay = startOfWeek(date, { weekStartsOn: 1 });
    const spaceId = opts.params.spaceId;

    throw redirect({
      to: `/spaces/$spaceId/timeline/$date`,
      params: {
        date: format(startWeekDay, "yyyy-MM-dd"),
        spaceId,
      },
    });
  },
});
