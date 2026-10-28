import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/spaces/$spaceId/calendar/")({
  loader: (opts) => {
    throw redirect({
      to: `/spaces/$spaceId/calendar/$date`,
      params: {
        date: format(new Date(), "yyyy-MM-dd"),
        spaceId: opts.params.spaceId,
      },
      search: { view: "week" },
    });
  },
});
