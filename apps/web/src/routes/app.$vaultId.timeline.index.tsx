import { createFileRoute, redirect } from "@tanstack/react-router";
import { format, startOfWeek } from "date-fns";

export const Route = createFileRoute("/app/$vaultId/timeline/")({
  loader: (opts) => {
    const date = new Date();

    const startWeekDay = startOfWeek(date, { weekStartsOn: 1 });
    const vaultId = opts.params.vaultId;

    throw redirect({
      to: `/app/$vaultId/timeline/$date`,
      params: {
        date: format(startWeekDay, "yyyy-MM-dd"),
        vaultId,
      },
    });
  },
});
