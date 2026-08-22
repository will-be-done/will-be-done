import { createFileRoute } from "@tanstack/react-router";
import { addDays, startOfWeek } from "date-fns";
import { CalendarView } from "@/components/Calendar/CalendarView.tsx";
import { GlobalLayout } from "@/components/Layout/GlobalLayout.tsx";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  createManyDailyListsIfNotPresent,
  timedTasksForRange,
  upcomingTemplateOccurrencesInRange,
} from "@will-be-done/slices/space";

export const Route = createFileRoute("/spaces/$spaceId/calendar")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const db = await context.spaceDbPromise;
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const dates = Array.from({ length: 7 }, (_, index) =>
      addDays(weekStart, index).getTime(),
    );

    await asyncDispatch(db, createManyDailyListsIfNotPresent({ dates }));
    await preloadSelectorAsync(db, {
      selector: timedTasksForRange,
      args: {
        fromInclusive: weekStart.getTime(),
        toExclusive: addDays(weekStart, 7).getTime(),
      },
    });
    await preloadSelectorAsync(db, {
      selector: upcomingTemplateOccurrencesInRange,
      args: {
        fromInclusive: weekStart.getTime(),
        toExclusive: addDays(weekStart, 7).getTime(),
      },
    });
  },
});

function RouteComponent() {
  return (
    <GlobalLayout>
      <div className="flex h-full w-full min-h-0">
        <div className="h-full min-w-0 flex-1">
          <CalendarView />
        </div>
        <div className="hidden h-full sm:block">
          <ItemDetails />
        </div>
      </div>
    </GlobalLayout>
  );
}
