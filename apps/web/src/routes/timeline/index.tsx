import { createFileRoute, redirect } from "@tanstack/react-router";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/timeline/")({
  loader: () => {
    const date = new Date();

    const startWeekDay = startOfWeek(date, { weekStartsOn: 1 });

    throw redirect({
      to: `/timeline/$date`,
      params: {
        date: format(startWeekDay, "yyyy-MM-dd"),
      },
    });
  },
});
