import { createFileRoute, redirect } from "@tanstack/react-router";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/timeline2/")({
  loader: () => {
    const date = new Date();

    const startWeekDay = startOfWeek(date, { weekStartsOn: 1 });

    throw redirect({
      to: `/timeline2/$date`,
      params: {
        date: format(startWeekDay, "yyyy-MM-dd"),
      },
    });
  },
});
