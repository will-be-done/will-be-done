import { createFileRoute } from "@tanstack/react-router";
import { parse, startOfDay } from "date-fns";
import { DateView } from "@/components/DateView/DateView.tsx";
import { asyncDispatch, preloadSelectorAsync } from "@will-be-done/hyperdb";
import {
  createManyDailyListsIfNotPresent,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  doneDailyEntryChildrenForDisplay,
  inboxProjectId,
  externalEventOccurrencesInRange,
} from "@will-be-done/slices/space";
import { externalEventsRange } from "@/components/ExternalEvents/useExternalEvents.ts";

export const Route = createFileRoute(
  "/spaces/$spaceId/_withSidebar/dates/$date",
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const db = await context.spaceDbPromise;
    const selectedDate = startOfDay(
      parse(params.date, "yyyy-MM-dd", new Date()),
    );
    const dates = [selectedDate.getTime()];
    const promises: Promise<unknown>[] = [];
    const appendPromise = (promise: Promise<unknown>) => {
      promises.push(promise);
    };

    await asyncDispatch(db, createManyDailyListsIfNotPresent({ dates }));

    const dailyLists = await preloadSelectorAsync(db, {
      selector: dailyListsByDates,
      args: { dates },
    });

    appendPromise(
      preloadSelectorAsync(db, { selector: inboxProjectId, args: {} }),
    );

    for (const date of dates) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: externalEventOccurrencesInRange,
          args: externalEventsRange([new Date(date)]),
        }),
      );
    }

    for (const dailyList of dailyLists) {
      appendPromise(
        preloadSelectorAsync(db, {
          selector: dailyEntryChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
      appendPromise(
        preloadSelectorAsync(db, {
          selector: doneDailyEntryChildrenForDisplay,
          args: { dailyListId: dailyList.id },
        }),
      );
    }

    await Promise.all(promises);
  },
});

function RouteComponent() {
  const params = Route.useParams();
  const date = parse(params.date, "yyyy-MM-dd", new Date());

  return <DateView selectedDate={date} />;
}
