import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/spaces/$spaceId/daily-reports/")({
  loader: (opts) => {
    const date = new Date();
    const spaceId = opts.params.spaceId;

    throw redirect({
      to: `/spaces/$spaceId/daily-reports/$date`,
      params: {
        date: format(date, "yyyy-MM-dd"),
        spaceId,
      },
    });
  },
});
