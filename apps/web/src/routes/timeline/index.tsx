import { createFileRoute, redirect } from "@tanstack/react-router";
import { format } from "date-fns";

export const Route = createFileRoute("/timeline/")({
  loader: () => {
    const date = new Date();

    throw redirect({
      to: `/timeline/$date`,
      params: {
        date: format(date, "yyyy-MM-dd"),
      },
    });
  },
});
