import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/timeline2/")({
  loader: () => {
    const date = new Date();

    throw redirect({
      to: `/timeline2/$date`,
      params: {
        date: format(date, "yyyy-MM-dd"),
      },
    });
  },
});
